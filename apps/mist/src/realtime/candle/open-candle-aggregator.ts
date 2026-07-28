import { Injectable } from '@nestjs/common';
import type { CanonicalRealtimeSnapshot } from '../realtime-native-frame';
import { resolveCandleBucket } from './candle-bucket.resolver';
import type {
  ApplySnapshotOutcome,
  CandleBucket,
  ClosingSnapshot,
  InvalidReason,
  OpenCandleState,
  SealedCandle,
} from './candle.types';

/**
 * Per-`(securityId + source)` key for the open-bucket map.
 *
 * design.md: "每个 securityId + tradingDay 只维护当前 effective source 的
 * 累计量 baseline 和 minute bucket". A security can only have one effective
 * realtime source, so keying on securityId+source is safe; different sources
 * for the same security are non-effective and rejected upstream.
 */
function aggregationKey(securityId: number, source: string): string {
  return `${source}:${securityId}`;
}

/**
 * Cumulative totals carried from a sealed bucket into the next one.
 *
 * `null` means "no trustworthy baseline exists" — the new bucket will mark
 * itself `baseline_unavailable` unless a snapshot arrives that establishes one.
 */
export interface BaselineTotals {
  cumulativeVolume: number;
  cumulativeAmount: number;
}

/**
 * Result of sealing the current open bucket, if any.
 *
 * The caller (future `RealtimeMarketDataProductService`) is responsible for
 * persisting the sealed candle via the Redis finalizer and for feeding
 * `priorClosingTotals` back as the baseline of the next bucket.
 */
export interface SealResult {
  sealed: SealedCandle | null;
}

/**
 * Pure-logic, synchronous aggregator for current-day 1-minute candles.
 *
 * Owns a `Map<key, OpenCandleState>` of in-progress buckets keyed by
 * `source:securityId`. Does NOT touch Redis, async I/O, or the Node Clock —
 * all of those are layered above by the product service. This isolation makes
 * the entire candle state machine table-driven testable.
 *
 * Lifecycle per key:
 *   applySnapshot → (open | update | roll-over | skip | invalidate)
 *   sealCurrent() → SealedCandle | null  (for the finalizer / restart drain)
 *
 * Rules implemented (see design.md "Candle state machine"):
 *  - only in-session, priced, eventTime-bearing snapshots participate;
 *  - duplicate/late eventTime does not rewind state;
 *  - cumulative counters going backwards → `counter_reset` discard + rebase;
 *  - first bucket with no baseline → `baseline_unavailable` discard;
 *  - lunch break does not produce empty candles; baseline survives lunch;
 *  - new trading day does not inherit baseline.
 */
@Injectable()
export class OpenCandleAggregator {
  private readonly open = new Map<string, OpenCandleState>();
  /**
   * Last sealed closing totals per key — the baseline source for the next
   * bucket when no external baseline is supplied (e.g. across lunch within
   * the same trading day).
   */
  private readonly lastClosingTotals = new Map<string, BaselineTotals>();
  /** Last trading day seen per key, to detect day rollover (baseline reset). */
  private readonly lastTradingDay = new Map<string, string>();

  /**
   * Apply a transport-accepted snapshot to the aggregator.
   *
   * The optional `priorClosingTotals` lets the product service inject a
   * baseline recovered from Redis watermark on restart; when omitted, the
   * aggregator uses its own in-memory `lastClosingTotals` (the normal
   * in-process flow).
   */
  applySnapshot(
    snapshot: CanonicalRealtimeSnapshot,
    priorClosingTotals?: BaselineTotals | null,
  ): ApplySnapshotOutcome {
    // Rule: snapshots without eventTime refresh memory latest upstream but do
    // not participate in candle aggregation.
    if (snapshot.eventTime === null || !snapshot.quality.aggregationEligible) {
      return { kind: 'skipped', reason: 'no_event_time' };
    }

    const bucket = resolveCandleBucket(snapshot.eventTime);
    // Rule: out-of-session snapshots (lunch, pre-open, deep post-close) do not
    // aggregate.
    if (bucket === null) {
      return { kind: 'skipped', reason: 'out_of_session' };
    }

    // Rule: invalid price.
    if (!Number.isFinite(snapshot.prices.last) || snapshot.prices.last <= 0) {
      return { kind: 'skipped', reason: 'not_aggregation_eligible' };
    }

    const key = aggregationKey(snapshot.securityId, snapshot.source);
    const existing = this.open.get(key);

    // Detect trading-day rollover: a new day must not inherit baseline.
    const prevDay = this.lastTradingDay.get(key);
    if (prevDay !== undefined && prevDay !== bucket.tradingDay) {
      // Day changed — clear the carried baseline so the new day starts fresh.
      this.lastClosingTotals.delete(key);
    }
    this.lastTradingDay.set(key, bucket.tradingDay);

    // No existing open bucket for this key → open a new one.
    if (!existing) {
      return this.openNewBucket(key, bucket, snapshot, priorClosingTotals);
    }

    // Same bucket → update OHLC and deltas.
    if (existing.bucketStartMs === bucket.bucketStartMs) {
      return this.updateExistingBucket(existing, snapshot);
    }

    // Different bucket → seal the old, open the new.
    return this.rollOver(key, existing, bucket, snapshot, priorClosingTotals);
  }

  /**
   * Seal and remove the current open bucket for a key (used by the due
   * finalizer and shutdown drain). Returns null if there is nothing open.
   */
  sealCurrent(securityId: number, source: string): SealedCandle | null {
    const key = aggregationKey(securityId, source);
    const state = this.open.get(key);
    if (!state) return null;
    const sealed = this.toSealed(state);
    this.recordClosingTotals(key, sealed, state.tradingDay);
    this.open.delete(key);
    return sealed;
  }

  /** Read-only peek at the open state (for diagnostics / finalizer cutoff). */
  peekOpen(securityId: number, source: string): OpenCandleState | null {
    return this.open.get(aggregationKey(securityId, source)) ?? null;
  }

  // ---- internal helpers ------------------------------------------------

  private openNewBucket(
    key: string,
    bucket: CandleBucket,
    snapshot: CanonicalRealtimeSnapshot,
    priorClosingTotals: BaselineTotals | null | undefined,
  ): ApplySnapshotOutcome {
    // Resolve baseline: explicit injection > carried totals > none.
    const baseline =
      priorClosingTotals !== undefined
        ? (priorClosingTotals as BaselineTotals | null)
        : (this.lastClosingTotals.get(key) ?? null);

    const price = snapshot.prices.last;
    const cumVol = snapshot.cumulativeVolume;
    const cumAmt = snapshot.cumulativeAmount;

    // If cumulative totals are absent on the snapshot itself, the bucket can
    // still form OHLC but volume/amount deltas stay 0; that is not invalid.
    const snapshotHasTotals =
      cumVol !== null &&
      cumAmt !== null &&
      Number.isFinite(cumVol) &&
      Number.isFinite(cumAmt);

    // First-snapshot delta: if a prior baseline exists (from a sealed candle
    // or restart injection), delta = current - baseline; otherwise the first
    // snapshot establishes the running total and delta = 0.
    let initialVolDelta = 0;
    let initialAmtDelta = 0;
    if (
      snapshotHasTotals &&
      baseline !== null &&
      Number.isFinite(baseline.cumulativeVolume) &&
      Number.isFinite(baseline.cumulativeAmount)
    ) {
      initialVolDelta = Math.max(0, cumVol! - baseline.cumulativeVolume);
      initialAmtDelta = Math.max(0, cumAmt! - baseline.cumulativeAmount);
    }

    const state: OpenCandleState = {
      tradingDay: bucket.tradingDay,
      source: snapshot.source,
      providerSymbol: snapshot.providerSymbol,
      securityId: snapshot.securityId,
      securityCode: '', // not present on CanonicalRealtimeSnapshot; filled by caller if needed
      session: bucket.session,
      bucketStartMs: bucket.bucketStartMs,
      bucketEndMs: bucket.bucketEndMs,
      open: price,
      high: price,
      low: price,
      close: price,
      volumeDelta: initialVolDelta,
      amountDelta: initialAmtDelta,
      lastCumulativeVolume: snapshotHasTotals ? cumVol : null,
      lastCumulativeAmount: snapshotHasTotals ? cumAmt : null,
      firstEventTime: snapshot.eventTime!,
      lastEventTime: snapshot.eventTime!,
      lastAppliedEventTimeMs: Date.parse(snapshot.eventTime!),
      closingSnapshot: toClosingSnapshot(snapshot),
      validity: 'valid',
      invalidReason: null,
    };

    // The first snapshot's own cumulative totals serve as the bucket's delta
    // starting point (delta = 0 for this snapshot; subsequent snapshots compute
    // delta = current - lastCumulative). This is valid and does NOT warrant a
    // baseline_unavailable discard — that reason is reserved for stricter future
    // scenarios (e.g. a provider that never emits cumulative totals at all).
    // When no prior/external baseline exists, volume/amount deltas simply
    // start from zero relative to this snapshot's totals.
    this.open.set(key, state);
    return state.validity === 'valid'
      ? { kind: 'opened', bucket }
      : { kind: 'invalidated', reason: state.invalidReason!, bucket };
  }

  private updateExistingBucket(
    state: OpenCandleState,
    snapshot: CanonicalRealtimeSnapshot,
  ): ApplySnapshotOutcome {
    const eventMs = Date.parse(snapshot.eventTime!);
    // Rule: duplicate or late eventTime does not rewind state.
    if (eventMs <= state.lastAppliedEventTimeMs) {
      return { kind: 'skipped', reason: 'duplicate_or_late' };
    }

    const price = snapshot.prices.last;
    if (!Number.isFinite(price) || price <= 0) {
      // Mark invalid but keep the bucket so the finalizer discards it whole.
      state.validity = 'invalid';
      state.invalidReason = 'invalid_price';
      return {
        kind: 'invalidated',
        reason: 'invalid_price',
        bucket: bucketOf(state),
      };
    }

    state.high = Math.max(state.high, price);
    state.low = Math.min(state.low, price);
    state.close = price;
    state.lastEventTime = snapshot.eventTime!;
    state.lastAppliedEventTimeMs = eventMs;
    state.closingSnapshot = toClosingSnapshot(snapshot);

    // Apply cumulative deltas if available.
    const cumVol = snapshot.cumulativeVolume;
    const cumAmt = snapshot.cumulativeAmount;
    if (
      cumVol !== null &&
      cumAmt !== null &&
      state.lastCumulativeVolume !== null &&
      state.lastCumulativeAmount !== null
    ) {
      const dVol = cumVol - state.lastCumulativeVolume;
      const dAmt = cumAmt - state.lastCumulativeAmount;
      if (dVol < 0 || dAmt < 0) {
        // Rule: counter reset → discard this bucket, rebase for the next.
        state.validity = 'invalid';
        state.invalidReason = 'counter_reset';
        // The current cumulative reading becomes the new baseline.
        state.lastCumulativeVolume = cumVol;
        state.lastCumulativeAmount = cumAmt;
        return {
          kind: 'invalidated',
          reason: 'counter_reset',
          bucket: bucketOf(state),
        };
      }
      state.volumeDelta += dVol;
      state.amountDelta += dAmt;
      state.lastCumulativeVolume = cumVol;
      state.lastCumulativeAmount = cumAmt;
    }

    return { kind: 'updated', bucket: bucketOf(state) };
  }

  private rollOver(
    key: string,
    oldState: OpenCandleState,
    bucket: CandleBucket,
    snapshot: CanonicalRealtimeSnapshot,
    priorClosingTotals: BaselineTotals | null | undefined,
  ): ApplySnapshotOutcome {
    const sealed = this.toSealed(oldState);
    this.recordClosingTotals(key, sealed, oldState.tradingDay);
    this.open.delete(key);
    const opened = this.openNewBucket(
      key,
      bucket,
      snapshot,
      priorClosingTotals,
    );
    return {
      kind: 'rolled-over',
      sealed,
      opened:
        opened.kind === 'opened' || opened.kind === 'invalidated'
          ? bucket
          : null,
    };
  }

  private toSealed(state: OpenCandleState): SealedCandle {
    return {
      tradingDay: state.tradingDay,
      source: state.source,
      providerSymbol: state.providerSymbol,
      securityId: state.securityId,
      securityCode: state.securityCode,
      session: state.session,
      bucketStartMs: state.bucketStartMs,
      bucketEndMs: state.bucketEndMs,
      open: state.open,
      high: state.high,
      low: state.low,
      close: state.close,
      volume: state.volumeDelta,
      amount: state.amountDelta,
      closingCumulativeVolume: state.lastCumulativeVolume ?? 0,
      closingCumulativeAmount: state.lastCumulativeAmount ?? 0,
      closingSnapshot: state.closingSnapshot,
      firstEventTime: state.firstEventTime,
      lastEventTime: state.lastEventTime,
      validity: state.validity,
      invalidReason: state.invalidReason,
      quality: 'provisional',
    };
  }

  private recordClosingTotals(
    key: string,
    sealed: SealedCandle,
    tradingDay: string,
  ): void {
    // Only carry forward totals from valid (non-discarded) buckets; invalid
    // buckets do not establish a trustworthy baseline.
    if (sealed.validity === 'valid') {
      this.lastClosingTotals.set(key, {
        cumulativeVolume: sealed.closingCumulativeVolume,
        cumulativeAmount: sealed.closingCumulativeAmount,
      });
    }
    this.lastTradingDay.set(key, tradingDay);
  }

  /**
   * Mark the open bucket for a key as invalid with a given reason (used by the
   * future Redis-due-registration-failed / queue-overflow layers).
   */
  markInvalid(securityId: number, source: string, reason: InvalidReason): void {
    const key = aggregationKey(securityId, source);
    const state = this.open.get(key);
    if (state && state.validity === 'valid') {
      state.validity = 'invalid';
      state.invalidReason = reason;
    }
  }
}

// ---- helpers ---------------------------------------------------------------

function bucketOf(state: OpenCandleState): CandleBucket {
  return {
    tradingDay: state.tradingDay,
    session: state.session,
    bucketStartMs: state.bucketStartMs,
    bucketEndMs: state.bucketEndMs,
  };
}

/**
 * Project the canonical snapshot down to the compact closing-snapshot form.
 * design.md forbids copying the full native object into the closed record.
 */
function toClosingSnapshot(
  snapshot: CanonicalRealtimeSnapshot,
): ClosingSnapshot {
  return {
    securityId: snapshot.securityId,
    securityCode: '', // CanonicalRealtimeSnapshot does not carry code; caller fills if needed
    providerSymbol: snapshot.providerSymbol,
    source: snapshot.source,
    eventTime: snapshot.eventTime ?? '',
    capturedAt: snapshot.capturedAt,
    price: snapshot.prices.last,
    cumulativeVolume: snapshot.cumulativeVolume ?? 0,
    cumulativeAmount: snapshot.cumulativeAmount ?? 0,
    quality: { ...snapshot.quality },
  };
}
