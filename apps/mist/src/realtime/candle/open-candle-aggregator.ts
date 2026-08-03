import { Decimal8 } from '@app/decimal';
import { Injectable } from '@nestjs/common';
import type {
  CanonicalRealtimeSnapshot,
  RealtimeSource,
} from '../realtime.types';
import { resolveCandleBucket } from './candle-bucket.util';
import type {
  ApplySnapshotOutcome,
  CandleBucket,
  ClosingSnapshot,
  InvalidReason,
  OpenCandleState,
  SealedCandle,
} from './candle.types';
import { marketSeriesKey } from './market-series-key';

export interface BaselineTotals {
  tradingDay: string;
  cumulativeVolume: string | null;
  cumulativeAmount: string | null;
}

export interface ApplySnapshotOptions {
  /** Optional committed same-day baseline restored by the owning recovery path. */
  priorClosingTotals?: BaselineTotals | null;
  /** Backend acceptance time used to enforce the configured grace cutoff. */
  acceptedAtMs?: number;
  graceMs?: number;
}

interface CandidateSlot {
  state: OpenCandleState;
  frozen: SealedCandle | null;
}

interface MarketSeriesState {
  tradingDay: string;
  current: CandidateSlot | null;
  prior: CandidateSlot | null;
  committedBaseline: BaselineTotals | null;
}

interface QuantityState {
  baseline: string | null;
  first: string | null;
  last: string | null;
  delta: string | null;
  counterReset: boolean;
}

/**
 * Bounded current-day candle state for one `(securityId,source)` series.
 *
 * A series owns at most two mutable candidates: the current minute and one
 * immediately preceding grace-pending minute. Rollover never seals or removes
 * the prior candidate. The finalizer freezes, commits and releases a candidate
 * by its complete `(securityId,source,bucketStartMs)` identity.
 */
@Injectable()
export class OpenCandleAggregator {
  private readonly series = new Map<string, MarketSeriesState>();

  applySnapshot(
    snapshot: CanonicalRealtimeSnapshot,
    options: ApplySnapshotOptions = {},
  ): ApplySnapshotOutcome {
    if (snapshot.eventTime === null || !snapshot.quality.aggregationEligible) {
      return { kind: 'skipped', reason: 'no_event_time' };
    }

    const bucket = resolveCandleBucket(snapshot.eventTime);
    if (bucket === null) {
      return { kind: 'skipped', reason: 'out_of_session' };
    }
    if (
      options.acceptedAtMs !== undefined &&
      options.graceMs !== undefined &&
      options.acceptedAtMs > bucket.bucketEndMs + options.graceMs
    ) {
      return { kind: 'skipped', reason: 'late_after_grace' };
    }

    // A security can move source between trading days. Remove every prior-day
    // owner for that canonical security before accepting the new day so an
    // old source cannot retain mutable baselines indefinitely.
    const securityPrefix = `${snapshot.securityId}:`;
    for (const [seriesKey, state] of this.series) {
      if (
        seriesKey.startsWith(securityPrefix) &&
        state.tradingDay !== bucket.tradingDay
      ) {
        this.series.delete(seriesKey);
      }
    }

    const key = marketSeriesKey(snapshot.securityId, snapshot.source);
    let owner = this.series.get(key);
    if (!owner || owner.tradingDay !== bucket.tradingDay) {
      owner = {
        tradingDay: bucket.tradingDay,
        current: null,
        prior: null,
        committedBaseline:
          options.priorClosingTotals?.tradingDay === bucket.tradingDay
            ? options.priorClosingTotals
            : null,
      };
      this.series.set(key, owner);
    }

    if (!owner.current) {
      if (!isValidPrice(snapshot.prices.last)) {
        return { kind: 'skipped', reason: 'not_aggregation_eligible' };
      }
      owner.current = this.openCandidate(
        bucket,
        snapshot,
        owner.committedBaseline,
      );
      return outcomeForOpened(owner.current.state);
    }

    if (bucket.bucketStartMs === owner.current.state.bucketStartMs) {
      return this.updateCandidate(owner, owner.current, snapshot, false);
    }

    if (owner.prior?.state.bucketStartMs === bucket.bucketStartMs) {
      return this.updateCandidate(owner, owner.prior, snapshot, true);
    }

    if (bucket.bucketStartMs < owner.current.state.bucketStartMs) {
      return { kind: 'skipped', reason: 'duplicate_or_late' };
    }

    if (owner.prior !== null) {
      return { kind: 'skipped', reason: 'candidate_capacity_exceeded' };
    }

    if (!isValidPrice(snapshot.prices.last)) {
      return { kind: 'skipped', reason: 'not_aggregation_eligible' };
    }

    const prior = owner.current;
    owner.prior = prior;
    owner.current = this.openCandidate(
      bucket,
      snapshot,
      prior.state.validity === 'valid'
        ? baselineFromCandidate(prior.state)
        : owner.committedBaseline,
    );
    return {
      kind: 'rolled-over',
      prior: bucketOf(prior.state),
      opened: bucket,
    };
  }

  peekOpen(securityId: number, source: RealtimeSource): OpenCandleState | null {
    return (
      this.series.get(marketSeriesKey(securityId, source))?.current?.state ??
      null
    );
  }

  peekCandidate(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): OpenCandleState | null {
    return (
      this.findCandidate(securityId, source, bucketStartMs)?.slot.state ?? null
    );
  }

  candidateBuckets(
    securityId: number,
    source: RealtimeSource,
  ): readonly number[] {
    const owner = this.series.get(marketSeriesKey(securityId, source));
    if (!owner) return [];
    return [owner.prior, owner.current]
      .filter((candidate): candidate is CandidateSlot => candidate !== null)
      .map((candidate) => candidate.state.bucketStartMs);
  }

  diagnostics(): {
    seriesCount: number;
    candidateCount: number;
    invalidCandidateCount: number;
    frozenCandidateCount: number;
  } {
    let candidateCount = 0;
    let invalidCandidateCount = 0;
    let frozenCandidateCount = 0;
    for (const owner of this.series.values()) {
      for (const candidate of [owner.prior, owner.current]) {
        if (!candidate) continue;
        candidateCount++;
        if (candidate.state.validity === 'invalid') invalidCandidateCount++;
        if (candidate.frozen) frozenCandidateCount++;
      }
    }
    return {
      seriesCount: this.series.size,
      candidateCount,
      invalidCandidateCount,
      frozenCandidateCount,
    };
  }

  /** Freeze an exact candidate without removing it or advancing baseline. */
  freezeCandidate(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): SealedCandle | null {
    const candidate = this.findCandidate(securityId, source, bucketStartMs);
    if (!candidate) return null;
    candidate.slot.frozen ??= toSealed(candidate.slot.state);
    return candidate.slot.frozen;
  }

  /** Release an exact frozen candidate only after its Redis commit succeeds. */
  commitCandidate(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): boolean {
    const candidate = this.findCandidate(securityId, source, bucketStartMs);
    if (!candidate) return false;
    const { owner, position, slot } = candidate;
    const frozen = slot.frozen;
    if (!frozen) return false;
    if (frozen.validity === 'valid') {
      owner.committedBaseline = {
        tradingDay: frozen.tradingDay,
        cumulativeVolume: frozen.closingCumulativeVolume,
        cumulativeAmount: frozen.closingCumulativeAmount,
      };
    }
    owner[position] = null;
    this.deleteOwnerIfEmpty(securityId, source, owner);
    return true;
  }

  /** Release an exact candidate after a diagnosed hard-horizon gap. */
  releaseCandidate(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): boolean {
    const candidate = this.findCandidate(securityId, source, bucketStartMs);
    if (!candidate) return false;
    candidate.owner[candidate.position] = null;
    this.deleteOwnerIfEmpty(securityId, source, candidate.owner);
    return true;
  }

  markInvalid(
    securityId: number,
    source: RealtimeSource,
    reason: InvalidReason,
    bucketStartMs?: number,
  ): void {
    const owner = this.series.get(marketSeriesKey(securityId, source));
    if (!owner) return;
    const slot =
      bucketStartMs === undefined
        ? owner.current
        : findSlotByBucket(owner, bucketStartMs);
    if (!slot || slot.frozen || slot.state.validity === 'invalid') return;
    slot.state.validity = 'invalid';
    slot.state.invalidReason = reason;
    if (slot === owner.prior) this.rebaseCurrent(owner);
  }

  private openCandidate(
    bucket: CandleBucket,
    snapshot: CanonicalRealtimeSnapshot,
    preceding: BaselineTotals | null,
  ): CandidateSlot {
    const volume = initializeQuantity(
      snapshot.cumulativeVolume,
      preceding?.tradingDay === bucket.tradingDay
        ? preceding.cumulativeVolume
        : null,
    );
    const amount = initializeQuantity(
      snapshot.cumulativeAmount,
      preceding?.tradingDay === bucket.tradingDay
        ? preceding.cumulativeAmount
        : null,
    );
    const counterReset = volume.counterReset || amount.counterReset;
    const price = snapshot.prices.last;
    const state: OpenCandleState = {
      tradingDay: bucket.tradingDay,
      source: snapshot.source,
      providerSymbol: snapshot.providerSymbol,
      securityId: snapshot.securityId,
      session: bucket.session,
      bucketStartMs: bucket.bucketStartMs,
      bucketEndMs: bucket.bucketEndMs,
      open: price,
      high: price,
      low: price,
      close: price,
      volumeDelta: volume.delta,
      amountDelta: amount.delta,
      baselineCumulativeVolume: volume.baseline,
      baselineCumulativeAmount: amount.baseline,
      firstCumulativeVolume: volume.first,
      firstCumulativeAmount: amount.first,
      lastCumulativeVolume: volume.last,
      lastCumulativeAmount: amount.last,
      firstEventTime: snapshot.eventTime!,
      lastEventTime: snapshot.eventTime!,
      lastAppliedEventTimeMs: Date.parse(snapshot.eventTime!),
      closingSnapshot: toClosingSnapshot(snapshot),
      validity: counterReset ? 'invalid' : 'valid',
      invalidReason: counterReset ? 'counter_reset' : null,
    };
    return { state, frozen: null };
  }

  private updateCandidate(
    owner: MarketSeriesState,
    candidate: CandidateSlot,
    snapshot: CanonicalRealtimeSnapshot,
    isPrior: boolean,
  ): ApplySnapshotOutcome {
    if (candidate.frozen) {
      return { kind: 'skipped', reason: 'late_after_grace' };
    }
    const state = candidate.state;
    const eventMs = Date.parse(snapshot.eventTime!);
    if (eventMs <= state.lastAppliedEventTimeMs) {
      return { kind: 'skipped', reason: 'duplicate_or_late' };
    }

    const price = snapshot.prices.last;
    if (!isValidPrice(price)) {
      state.validity = 'invalid';
      state.invalidReason = 'invalid_price';
      if (isPrior) this.rebaseCurrent(owner);
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

    const volume = applyQuantityUpdate(
      readQuantity(state, 'volume'),
      snapshot.cumulativeVolume,
    );
    const amount = applyQuantityUpdate(
      readQuantity(state, 'amount'),
      snapshot.cumulativeAmount,
    );
    writeQuantity(state, 'volume', volume);
    writeQuantity(state, 'amount', amount);
    if (volume.counterReset || amount.counterReset) {
      state.validity = 'invalid';
      state.invalidReason = 'counter_reset';
      if (isPrior) this.rebaseCurrent(owner);
      return {
        kind: 'invalidated',
        reason: 'counter_reset',
        bucket: bucketOf(state),
      };
    }

    if (isPrior) this.rebaseCurrent(owner);
    return { kind: 'updated', bucket: bucketOf(state) };
  }

  private rebaseCurrent(owner: MarketSeriesState): void {
    const current = owner.current?.state;
    if (!current) return;
    const preceding =
      owner.prior?.state.validity === 'valid'
        ? baselineFromCandidate(owner.prior.state)
        : owner.committedBaseline;
    const volume = rebaseQuantity(
      readQuantity(current, 'volume'),
      preceding?.cumulativeVolume ?? null,
    );
    const amount = rebaseQuantity(
      readQuantity(current, 'amount'),
      preceding?.cumulativeAmount ?? null,
    );
    writeQuantity(current, 'volume', volume);
    writeQuantity(current, 'amount', amount);
    if (volume.counterReset || amount.counterReset) {
      current.validity = 'invalid';
      current.invalidReason = 'counter_reset';
    }
  }

  private findCandidate(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): {
    owner: MarketSeriesState;
    position: 'current' | 'prior';
    slot: CandidateSlot;
  } | null {
    const owner = this.series.get(marketSeriesKey(securityId, source));
    if (!owner) return null;
    if (owner.current?.state.bucketStartMs === bucketStartMs) {
      return { owner, position: 'current', slot: owner.current };
    }
    if (owner.prior?.state.bucketStartMs === bucketStartMs) {
      return { owner, position: 'prior', slot: owner.prior };
    }
    return null;
  }

  private deleteOwnerIfEmpty(
    securityId: number,
    source: RealtimeSource,
    owner: MarketSeriesState,
  ): void {
    if (!owner.current && !owner.prior && !owner.committedBaseline) {
      this.series.delete(marketSeriesKey(securityId, source));
    }
  }
}

function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function outcomeForOpened(state: OpenCandleState): ApplySnapshotOutcome {
  return state.validity === 'invalid'
    ? {
        kind: 'invalidated',
        reason: state.invalidReason ?? 'invalid_ohlc',
        bucket: bucketOf(state),
      }
    : { kind: 'opened', bucket: bucketOf(state) };
}

function findSlotByBucket(
  owner: MarketSeriesState,
  bucketStartMs: number,
): CandidateSlot | null {
  if (owner.current?.state.bucketStartMs === bucketStartMs)
    return owner.current;
  if (owner.prior?.state.bucketStartMs === bucketStartMs) return owner.prior;
  return null;
}

function baselineFromCandidate(state: OpenCandleState): BaselineTotals {
  return {
    tradingDay: state.tradingDay,
    cumulativeVolume: state.lastCumulativeVolume,
    cumulativeAmount: state.lastCumulativeAmount,
  };
}

function bucketOf(state: OpenCandleState): CandleBucket {
  return {
    tradingDay: state.tradingDay,
    session: state.session,
    bucketStartMs: state.bucketStartMs,
    bucketEndMs: state.bucketEndMs,
  };
}

function toClosingSnapshot(
  snapshot: CanonicalRealtimeSnapshot,
): ClosingSnapshot {
  return {
    securityId: snapshot.securityId,
    providerSymbol: snapshot.providerSymbol,
    source: snapshot.source,
    eventTime: snapshot.eventTime ?? '',
    capturedAt: snapshot.capturedAt,
    price: snapshot.prices.last,
    cumulativeVolume: snapshot.cumulativeVolume,
    cumulativeAmount: snapshot.cumulativeAmount,
    quality: { ...snapshot.quality },
  };
}

function toSealed(state: OpenCandleState): SealedCandle {
  return {
    tradingDay: state.tradingDay,
    source: state.source,
    providerSymbol: state.providerSymbol,
    securityId: state.securityId,
    session: state.session,
    bucketStartMs: state.bucketStartMs,
    bucketEndMs: state.bucketEndMs,
    open: state.open,
    high: state.high,
    low: state.low,
    close: state.close,
    volume: state.volumeDelta,
    amount: state.amountDelta,
    closingCumulativeVolume: state.lastCumulativeVolume,
    closingCumulativeAmount: state.lastCumulativeAmount,
    closingSnapshot: state.closingSnapshot
      ? {
          ...state.closingSnapshot,
          quality: { ...state.closingSnapshot.quality },
        }
      : null,
    firstEventTime: state.firstEventTime,
    lastEventTime: state.lastEventTime,
    validity: state.validity,
    invalidReason: state.invalidReason,
    quality: 'provisional',
  };
}

function initializeQuantity(
  current: string | null,
  preceding: string | null,
): QuantityState {
  if (current === null) {
    return preceding === null
      ? {
          baseline: null,
          first: null,
          last: null,
          delta: null,
          counterReset: false,
        }
      : {
          baseline: preceding,
          first: null,
          last: preceding,
          delta: '0',
          counterReset: false,
        };
  }

  const currentValue = Decimal8.parseCanonical(current);
  if (preceding === null) {
    return {
      baseline: null,
      first: current,
      last: current,
      delta: null,
      counterReset: false,
    };
  }
  const precedingValue = Decimal8.parseCanonical(preceding);
  if (currentValue.compare(precedingValue) < 0) {
    return {
      baseline: preceding,
      first: current,
      last: current,
      delta: '0',
      counterReset: true,
    };
  }
  return {
    baseline: preceding,
    first: current,
    last: current,
    delta: currentValue.subtract(precedingValue).formatCanonical(),
    counterReset: false,
  };
}

function applyQuantityUpdate(
  quantity: QuantityState,
  current: string | null,
): QuantityState {
  if (current === null) return { ...quantity, counterReset: false };
  const currentValue = Decimal8.parseCanonical(current);
  const previous = quantity.last ?? quantity.baseline;
  if (
    previous !== null &&
    currentValue.compare(Decimal8.parseCanonical(previous)) < 0
  ) {
    return { ...quantity, last: current, counterReset: true };
  }
  const first = quantity.first ?? current;
  const baseline = quantity.baseline;
  if (baseline === null) {
    return {
      baseline: null,
      first,
      last: current,
      delta: null,
      counterReset: false,
    };
  }
  return {
    baseline,
    first,
    last: current,
    delta: currentValue
      .subtract(Decimal8.parseCanonical(baseline))
      .formatCanonical(),
    counterReset: false,
  };
}

function rebaseQuantity(
  quantity: QuantityState,
  preceding: string | null,
): QuantityState {
  if (quantity.first === null) {
    return initializeQuantity(null, preceding);
  }
  const last = quantity.last ?? quantity.first;
  if (preceding === null) {
    return {
      ...quantity,
      baseline: null,
      last,
      delta: null,
      counterReset: false,
    };
  }
  const baseline = preceding;
  const lastValue = Decimal8.parseCanonical(last);
  const baselineValue = Decimal8.parseCanonical(baseline);
  if (lastValue.compare(baselineValue) < 0) {
    return { ...quantity, baseline, last, counterReset: true };
  }
  return {
    ...quantity,
    baseline,
    last,
    delta: lastValue.subtract(baselineValue).formatCanonical(),
    counterReset: false,
  };
}

function readQuantity(
  state: OpenCandleState,
  field: 'volume' | 'amount',
): QuantityState {
  return field === 'volume'
    ? {
        baseline: state.baselineCumulativeVolume,
        first: state.firstCumulativeVolume,
        last: state.lastCumulativeVolume,
        delta: state.volumeDelta,
        counterReset: false,
      }
    : {
        baseline: state.baselineCumulativeAmount,
        first: state.firstCumulativeAmount,
        last: state.lastCumulativeAmount,
        delta: state.amountDelta,
        counterReset: false,
      };
}

function writeQuantity(
  state: OpenCandleState,
  field: 'volume' | 'amount',
  quantity: QuantityState,
): void {
  if (field === 'volume') {
    state.baselineCumulativeVolume = quantity.baseline;
    state.firstCumulativeVolume = quantity.first;
    state.lastCumulativeVolume = quantity.last;
    state.volumeDelta = quantity.delta;
    return;
  }
  state.baselineCumulativeAmount = quantity.baseline;
  state.firstCumulativeAmount = quantity.first;
  state.lastCumulativeAmount = quantity.last;
  state.amountDelta = quantity.delta;
}
