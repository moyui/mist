import { Injectable, Logger } from '@nestjs/common';
import { toZonedTime } from 'date-fns-tz';
import type Redis from 'ioredis';
import type { RealtimeSource } from '../realtime.types';
import type { InvalidReason, SealedCandle } from './candle.types';
import type { RealtimeClosedCandleRecordV1 } from '@app/realtime';
import {
  closedCandleKey,
  watermarkKey,
  manifestKey,
  dueKey,
  encodeDueMember,
  marketDayExpiryEpochSeconds,
  REALTIME_REDIS_RECORD_LIMITS,
  assertRealtimeRedisBytes,
} from '../realtime-redis.constants';

/**
 * Compact JSON representation of one sealed 1-minute candle, stored as the
 * value of a closed-Hash field keyed by `bucketStartMs`. Mirrors the fields
 * the design allows in the closed record (no full native object).
 */
export interface CandleFinalizerDiagnostics {
  sealedTotal: number;
  discardTotals: Array<{
    source: RealtimeSource;
    securityId: number;
    reason: InvalidReason;
    total: number;
  }>;
  finalizationFailureTotal: number;
  finalizationLastFailureAtMs: number | null;
  recordLimitBreachTotal: number;
  maxSealedRecordBytes: number;
  maxManifestBytes: number;
}

/**
 * Atomic Redis sealer for finalized 1-minute candles.
 *
 * Given a {@link SealedCandle} (produced by {@link OpenCandleAggregator}), this
 * commits the candle to Redis in a single `MULTI/EXEC` transaction:
 *
 * For a **valid** candle:
 *   1. `HSET closed-key bucketStartMs compact-json`  (the candle itself)
 *   2. `HSET watermark-key` sealedThroughBucket / outcome=closed / closing totals
 *   3. `ZREM due-key member`                         (bucket no longer pending)
 *   4. `HSET manifest-key` the list of keys in this partition
 *   5. `EXPIREAT` each exact key at Shanghai D+1 00:00
 *
 * For an **invalid** candle:
 *   1. (skip HSET closed — no K query exposure)
 *   2. `HSET watermark-key` outcome=discarded + reason
 *   3–5. same ZREM / manifest / EXPIRE
 *
 * The transaction is atomic: either all writes land or none do. The caller
 * (future due-scanner / product service) supplies the Redis client and the
 * current time; this class is pure I/O orchestration with no own state.
 */
@Injectable()
export class CandleFinalizer {
  private readonly logger = new Logger(CandleFinalizer.name);
  private sealedTotal = 0;
  private readonly discardTotals = new Map<
    string,
    Map<InvalidReason, number>
  >();
  private finalizationFailureTotal = 0;
  private finalizationLastFailureAtMs: number | null = null;
  private recordLimitBreachTotal = 0;
  private maxSealedRecordBytes = 0;
  private maxManifestBytes = 0;

  /**
   * Seal a candle into Redis atomically.
   *
   * @param redis   The market-data ioredis client (from RealtimeRedisService).
   * @param candle  The sealed candle from the aggregator.
   * @param nowMs   Current time from the caller's Clock (for relative TTL).
   * @returns       true if the transaction committed, false on error.
   */
  async seal(
    redis: Redis,
    candle: SealedCandle,
    nowMs: number,
  ): Promise<boolean> {
    const tradingDay = candle.tradingDay;
    const closedK = closedCandleKey(
      tradingDay,
      candle.source,
      candle.securityId,
    );
    const wmK = watermarkKey(tradingDay, candle.source, candle.securityId);
    const manifestK = manifestKey(tradingDay, candle.source, candle.securityId);
    const dueK_ = dueKey(tradingDay);
    const manifest = {
      closed: closedK,
      watermark: wmK,
      due: dueK_,
    };

    let member: string;
    let compactRecord: string | null = null;
    try {
      member = encodeDueMember(
        candle.securityId,
        candle.source,
        candle.bucketStartMs,
      );
      if (candle.validity === 'valid') {
        compactRecord = JSON.stringify(this.toCompactRecord(candle));
        this.maxSealedRecordBytes = Math.max(
          this.maxSealedRecordBytes,
          Buffer.byteLength(compactRecord, 'utf8'),
        );
        assertRealtimeRedisBytes(
          'sealed candle record',
          compactRecord,
          REALTIME_REDIS_RECORD_LIMITS.sealed,
        );
      }
      this.maxManifestBytes = Math.max(
        this.maxManifestBytes,
        Buffer.byteLength(JSON.stringify(manifest), 'utf8'),
      );
      assertRealtimeRedisBytes(
        'candle manifest record',
        JSON.stringify(manifest),
        REALTIME_REDIS_RECORD_LIMITS.manifest,
      );
    } catch (error) {
      this.recordFinalizationFailure(true, true);
      this.logger.error(
        `Candle seal bounds failed for securityId=${candle.securityId} source=${candle.source} bucket ${candle.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }

    const expiresAt = marketDayExpiryEpochSeconds(tradingDay);
    if (Math.floor(nowMs / 1_000) >= expiresAt) {
      this.recordFinalizationFailure(false, true);
      this.logger.error(
        `Candle seal rejected expired tradingDay=${tradingDay} securityId=${candle.securityId} source=${candle.source}`,
      );
      return false;
    }

    const multi = redis.multi();

    if (candle.validity === 'valid') {
      multi.hset(closedK, String(candle.bucketStartMs), compactRecord!);
    }

    // Watermark: always advance, recording outcome + reason.
    multi.hset(wmK, {
      sealedThroughBucket: String(candle.bucketStartMs),
      outcome: candle.validity === 'valid' ? 'closed' : 'discarded',
      ...(candle.invalidReason ? { invalidReason: candle.invalidReason } : {}),
      ...(candle.closingCumulativeVolume !== null
        ? { closingCumulativeVolume: candle.closingCumulativeVolume }
        : {}),
      ...(candle.closingCumulativeAmount !== null
        ? { closingCumulativeAmount: candle.closingCumulativeAmount }
        : {}),
    });
    if (candle.closingCumulativeVolume === null) {
      multi.hdel(wmK, 'closingCumulativeVolume');
    }
    if (candle.closingCumulativeAmount === null) {
      multi.hdel(wmK, 'closingCumulativeAmount');
    }

    // Remove the due member for this bucket.
    multi.zrem(dueK_, member);

    // Record the partition manifest (idempotent key list for cleanup).
    multi.hset(manifestK, manifest);

    // Exact current-day retention. This does not touch any shared BullMQ key.
    multi.expireat(closedK, expiresAt);
    multi.expireat(wmK, expiresAt);
    multi.expireat(manifestK, expiresAt);
    multi.expireat(dueK_, expiresAt);

    try {
      const results = await multi.exec();
      // multi.exec returns null if the transaction was discarded (e.g.
      // WATCH conflict — we don't use WATCH, but guard anyway).
      if (results === null) {
        this.recordFinalizationFailure(false, false, nowMs);
        this.logger.error(
          `Candle seal transaction discarded for ${candle.providerSymbol} bucket ${candle.bucketStartMs}`,
        );
        return false;
      }
      if (candle.validity === 'valid') {
        this.sealedTotal++;
      } else if (candle.invalidReason) {
        this.recordDiscard(
          candle.source,
          candle.securityId,
          candle.invalidReason,
        );
      }
      return true;
    } catch (error) {
      this.recordFinalizationFailure(false, false, nowMs);
      this.logger.error(
        `Candle seal failed for ${candle.providerSymbol} bucket ${candle.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Discard a due bucket that lost its Node open state (e.g. after backend
   * restart). Design line 288-289: advance watermark to `discarded`, remove
   * the due member, but do NOT write a closed record (no HSET).
   */
  async discardDue(
    redis: Redis,
    decoded: {
      securityId: number;
      source: RealtimeSource;
      bucketStartMs: number;
    },
    reason: InvalidReason,
    nowMs: number,
  ): Promise<boolean> {
    const tradingDay = this.tradingDayFromBucketMs(decoded.bucketStartMs);
    const wmK = watermarkKey(tradingDay, decoded.source, decoded.securityId);
    const dueK_ = dueKey(tradingDay);
    const manifestK = manifestKey(
      tradingDay,
      decoded.source,
      decoded.securityId,
    );
    const manifest = { watermark: wmK, due: dueK_ };
    let member: string;
    try {
      member = encodeDueMember(
        decoded.securityId,
        decoded.source,
        decoded.bucketStartMs,
      );
      this.maxManifestBytes = Math.max(
        this.maxManifestBytes,
        Buffer.byteLength(JSON.stringify(manifest), 'utf8'),
      );
      assertRealtimeRedisBytes(
        'candle manifest record',
        JSON.stringify(manifest),
        REALTIME_REDIS_RECORD_LIMITS.manifest,
      );
    } catch (error) {
      this.recordFinalizationFailure(true, true);
      this.logger.error(
        `discardDue bounds failed for securityId=${decoded.securityId} source=${decoded.source} bucket ${decoded.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
    const expiresAt = marketDayExpiryEpochSeconds(tradingDay);
    if (Math.floor(nowMs / 1_000) >= expiresAt) {
      this.recordFinalizationFailure(false, true);
      return false;
    }

    const multi = redis.multi();
    multi.hset(wmK, {
      sealedThroughBucket: String(decoded.bucketStartMs),
      outcome: 'discarded',
      invalidReason: reason,
    });
    multi.zrem(dueK_, member);
    multi.hset(manifestK, manifest);
    multi.expireat(wmK, expiresAt);
    multi.expireat(manifestK, expiresAt);
    multi.expireat(dueK_, expiresAt);

    try {
      const committed = (await multi.exec()) !== null;
      if (committed) {
        this.recordDiscard(decoded.source, decoded.securityId, reason);
      } else {
        this.recordFinalizationFailure(false, false, nowMs);
      }
      return committed;
    } catch (error) {
      this.recordFinalizationFailure(false, false, nowMs);
      this.logger.error(
        `discardDue failed for securityId=${decoded.securityId} source=${decoded.source} bucket ${decoded.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  diagnostics(): CandleFinalizerDiagnostics {
    return {
      sealedTotal: this.sealedTotal,
      discardTotals: [...this.discardTotals.entries()]
        .flatMap(([key, byReason]) => {
          const [source, securityId] = key.split(':');
          return [...byReason.entries()].map(([reason, total]) => ({
            source: source as RealtimeSource,
            securityId: Number(securityId),
            reason,
            total,
          }));
        })
        .sort((left, right) =>
          `${left.source}:${left.securityId}:${left.reason}`.localeCompare(
            `${right.source}:${right.securityId}:${right.reason}`,
          ),
        ),
      finalizationFailureTotal: this.finalizationFailureTotal,
      finalizationLastFailureAtMs: this.finalizationLastFailureAtMs,
      recordLimitBreachTotal: this.recordLimitBreachTotal,
      maxSealedRecordBytes: this.maxSealedRecordBytes,
      maxManifestBytes: this.maxManifestBytes,
    };
  }

  /** Derive tradingDay (YYYYMMDD) from bucketStartMs in Asia/Shanghai. */
  private tradingDayFromBucketMs(bucketStartMs: number): string {
    const zoned = toZonedTime(new Date(bucketStartMs), 'Asia/Shanghai');
    return [
      zoned.getFullYear().toString().padStart(4, '0'),
      (zoned.getMonth() + 1).toString().padStart(2, '0'),
      zoned.getDate().toString().padStart(2, '0'),
    ].join('');
  }

  private toCompactRecord(candle: SealedCandle): RealtimeClosedCandleRecordV1 {
    return {
      o: candle.open,
      h: candle.high,
      l: candle.low,
      c: candle.close,
      v: candle.volume,
      a: candle.amount,
      cv: candle.closingCumulativeVolume,
      ca: candle.closingCumulativeAmount,
      cs: candle.closingSnapshot,
      fe: candle.firstEventTime,
      le: candle.lastEventTime,
      q: 'provisional',
    };
  }

  /**
   * Records a finalization failure. Deterministic rejections (expired trading
   * day, record byte limit) only accumulate counters; transient runtime errors
   * (MULTI/EXEC null or throw) additionally refresh the last-failure timestamp
   * that drives the windowed degraded verdict.
   *
   * @param recordLimitBreach Whether this failure is a record byte-limit breach
   *                          (increments recordLimitBreachTotal as well).
   * @param deterministic     True for expected lifecycle rejections that must
   *                          not influence the degraded verdict.
   * @param nowMs             Current time from the caller's Clock; ignored when
   *                          deterministic.
   */
  private recordFinalizationFailure(
    recordLimitBreach = false,
    deterministic = false,
    nowMs = 0,
  ): void {
    this.finalizationFailureTotal++;
    if (recordLimitBreach) this.recordLimitBreachTotal++;
    if (!deterministic) this.finalizationLastFailureAtMs = nowMs;
  }

  private recordDiscard(
    source: RealtimeSource,
    securityId: number,
    reason: InvalidReason,
  ): void {
    const key = `${source}:${securityId}`;
    const byReason =
      this.discardTotals.get(key) ?? new Map<InvalidReason, number>();
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    this.discardTotals.set(key, byReason);
  }
}
