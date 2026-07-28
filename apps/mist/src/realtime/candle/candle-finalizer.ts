import { Injectable, Logger } from '@nestjs/common';
import { toZonedTime } from 'date-fns-tz';
import type Redis from 'ioredis';
import type { RealtimeSource } from '../realtime.types';
import type { InvalidReason, SealedCandle } from './candle.types';
import {
  closedCandleKey,
  watermarkKey,
  manifestKey,
  dueKey,
  encodeDueMember,
  RETENTION_AFTER_DAY_END_HOURS,
} from '../realtime-redis.constants';

/**
 * Compact JSON representation of one sealed 1-minute candle, stored as the
 * value of a closed-Hash field keyed by `bucketStartMs`. Mirrors the fields
 * the design allows in the closed record (no full native object).
 */
interface CompactClosedRecord {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  a: number;
  cv: number;
  ca: number;
  cs: SealedCandle['closingSnapshot'];
  fe: string;
  le: string;
  q: 'provisional';
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
 *   5. `EXPIRE` each key to dayEnd+72h (relative, from the passed `nowMs`)
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

  /**
   * Seal a candle into Redis atomically.
   *
   * @param redis   The market-data ioredis client (from RealtimeRedisService).
   * @param candle  The sealed candle from the aggregator.
   * @param nowMs   Current time from the injected Clock (for relative TTL).
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
      candle.providerSymbol,
    );
    const wmK = watermarkKey(tradingDay, candle.source, candle.providerSymbol);
    const manifestK = manifestKey(
      tradingDay,
      candle.source,
      candle.providerSymbol,
    );
    const dueK_ = dueKey(tradingDay);
    const member = encodeDueMember(
      candle.securityId,
      candle.source,
      candle.providerSymbol,
      candle.bucketStartMs,
    );

    const ttlSeconds = this.computeTtlSeconds(candle.bucketEndMs, nowMs);

    const multi = redis.multi();

    if (candle.validity === 'valid') {
      const record = this.toCompactRecord(candle);
      multi.hset(closedK, String(candle.bucketStartMs), JSON.stringify(record));
    }

    // Watermark: always advance, recording outcome + reason.
    multi.hset(wmK, {
      sealedThroughBucket: String(candle.bucketStartMs),
      outcome: candle.validity === 'valid' ? 'closed' : 'discarded',
      ...(candle.invalidReason ? { invalidReason: candle.invalidReason } : {}),
      closingCumulativeVolume: String(candle.closingCumulativeVolume),
      closingCumulativeAmount: String(candle.closingCumulativeAmount),
    });

    // Remove the due member for this bucket.
    multi.zrem(dueK_, member);

    // Record the partition manifest (idempotent key list for cleanup).
    multi.hset(manifestK, {
      closed: closedK,
      watermark: wmK,
      due: dueK_,
    });

    // Relative TTL on all keys.
    multi.expire(closedK, ttlSeconds);
    multi.expire(wmK, ttlSeconds);
    multi.expire(manifestK, ttlSeconds);

    try {
      const results = await multi.exec();
      // multi.exec returns null if the transaction was discarded (e.g.
      // WATCH conflict — we don't use WATCH, but guard anyway).
      if (results === null) {
        this.logger.error(
          `Candle seal transaction discarded for ${candle.providerSymbol} bucket ${candle.bucketStartMs}`,
        );
        return false;
      }
      return true;
    } catch (error) {
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
      providerSymbol: string;
      bucketStartMs: number;
    },
    reason: InvalidReason,
    nowMs: number,
  ): Promise<boolean> {
    const tradingDay = this.tradingDayFromBucketMs(decoded.bucketStartMs);
    const wmK = watermarkKey(
      tradingDay,
      decoded.source,
      decoded.providerSymbol,
    );
    const dueK_ = dueKey(tradingDay);
    const member = encodeDueMember(
      decoded.securityId,
      decoded.source,
      decoded.providerSymbol,
      decoded.bucketStartMs,
    );
    const ttlSeconds = Math.max(
      Math.ceil(
        (decoded.bucketStartMs +
          60_000 +
          RETENTION_AFTER_DAY_END_HOURS * 3600_000 -
          nowMs) /
          1000,
      ),
      1,
    );

    const multi = redis.multi();
    multi.hset(wmK, {
      sealedThroughBucket: String(decoded.bucketStartMs),
      outcome: 'discarded',
      invalidReason: reason,
    });
    multi.zrem(dueK_, member);
    multi.expire(wmK, ttlSeconds);

    try {
      await multi.exec();
      return true;
    } catch (error) {
      this.logger.error(
        `discardDue failed for ${decoded.providerSymbol} bucket ${decoded.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
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

  /**
   * Compute the relative TTL (seconds) from now until bucketEnd + 72h.
   * design.md: "目标过期点为 dayEnd + 72h". We approximate dayEnd from the
   * bucket end (the last bucket of the day ends at/near close). This is a
   * safe upper bound; the post-close sync change deletes keys precisely.
   */
  private computeTtlSeconds(bucketEndMs: number, nowMs: number): number {
    const retentionMs = RETENTION_AFTER_DAY_END_HOURS * 3600_000;
    const targetMs = bucketEndMs + retentionMs;
    const ttl = Math.ceil((targetMs - nowMs) / 1000);
    // Floor at 1 second to avoid negative/zero TTL (which means "delete now"
    // in Redis). If we're past the target, give a small grace.
    return Math.max(ttl, 1);
  }

  private toCompactRecord(candle: SealedCandle): CompactClosedRecord {
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
}
