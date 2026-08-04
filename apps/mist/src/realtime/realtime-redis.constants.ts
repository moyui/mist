import type { RealtimeSource } from './realtime.types';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Redis key builders for the current-day realtime candle product (B1).
 *
 * All keys live under the `mist:realtime:v1` namespace and are targeted at
 * `MIST_REALTIME_REDIS_URL`. The single-node deployment may share that Redis
 * endpoint with BullMQ, but market keys remain isolated under this namespace
 * and are expired only by their exact names.
 *
 * Field semantics (see design.md "Node.js latest 与 Redis key/TTL"):
 * - `tradingDay`   — `YYYYMMDD` in Asia/Shanghai, derived from eventTime.
 * - `source`       — `'tdx' | 'qmt'` market-series dimension.
 * - `securityId`   — canonical Mist security identity.
 */

export const REALTIME_MARKET_REDIS_NAMESPACE = 'mist:realtime:v1';

/** Approved UTF-8 record limits from the candle capacity review. */
export const REALTIME_REDIS_RECORD_LIMITS = {
  sealed: 2_048,
  dueMember: 128,
  manifest: 1_024,
} as const;

/** Fixed bound for due scans and startup replay commands. */
export const REALTIME_REDIS_RANGE_BATCH_SIZE = 64;

/**
 * Per-symbol closed-candle Hash. Field = `bucketStartMs`; value = compact
 * candle JSON. Written once per bucket via a finalizer `MULTI/EXEC`.
 */
export function closedCandleKey(
  tradingDay: string,
  source: RealtimeSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:candle:1m:closed`;
}

/**
 * Per-series sealing watermark. Records the last sealed-through bucket,
 * outcome (closed/discarded), and closing cumulative totals. Transport
 * generation/sequence do not belong to candle state.
 */
export function watermarkKey(
  tradingDay: string,
  source: RealtimeSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:candle:1m:watermark`;
}

/**
 * Per-symbol partition manifest. Lists the structured Redis keys belonging to
 * this `tradingDay + source + securityId` partition, so the post-close
 * sync change can delete them precisely without wildcards.
 */
export function manifestKey(
  tradingDay: string,
  source: RealtimeSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:manifest`;
}

/**
 * Global due ZSET for the trading day. Score = bucket cutoff epoch ms;
 * member encodes which symbol+source+bucket is awaiting finalization. The
 * due scanner reads this with `ZRANGEBYSCORE` up to the Node clock's `now()`.
 */
export function dueKey(tradingDay: string): string {
  return `${REALTIME_MARKET_REDIS_NAMESPACE}:day:${tradingDay}:candle:1m:due`;
}

/** Exact expiry for day D market keys: Shanghai D+1 00:00, in epoch seconds. */
export function marketDayExpiryEpochSeconds(tradingDay: string): number {
  if (!/^\d{8}$/.test(tradingDay)) {
    throw new RangeError('tradingDay must use YYYYMMDD');
  }
  const wallMidnight = `${tradingDay.slice(0, 4)}-${tradingDay.slice(4, 6)}-${tradingDay.slice(6, 8)}T00:00:00.000`;
  const start = fromZonedTime(wallMidnight, 'Asia/Shanghai').getTime();
  if (!Number.isFinite(start)) throw new RangeError('tradingDay is invalid');
  const zoned = toZonedTime(new Date(start), 'Asia/Shanghai');
  const roundTrip = [
    zoned.getFullYear().toString().padStart(4, '0'),
    (zoned.getMonth() + 1).toString().padStart(2, '0'),
    zoned.getDate().toString().padStart(2, '0'),
  ].join('');
  if (roundTrip !== tradingDay) throw new RangeError('tradingDay is invalid');
  return Math.floor((start + 24 * 60 * 60_000) / 1_000);
}

/**
 * Due ZSET member encoding. Members must carry enough identity for the due
 * scanner to route the finalize task into the correct per-securityId keyed
 * queue (design line 57) and resolve Redis partition keys.
 *
 * Format: `securityId:source:bucketStartMs`
 */
export function encodeDueMember(
  securityId: number,
  source: RealtimeSource,
  bucketStartMs: number,
): string {
  assertSecurityId(securityId);
  const member = `${securityId}:${source}:${bucketStartMs}`;
  assertRealtimeRedisBytes(
    'due member',
    member,
    REALTIME_REDIS_RECORD_LIMITS.dueMember,
  );
  return member;
}

/** Inverse of {@link encodeDueMember}. */
export function decodeDueMember(member: string): {
  securityId: number;
  source: RealtimeSource;
  bucketStartMs: number;
} {
  assertRealtimeRedisBytes(
    'due member',
    member,
    REALTIME_REDIS_RECORD_LIMITS.dueMember,
  );
  const parts = member.split(':');
  if (parts.length !== 3) {
    throw new RangeError('due member must contain exactly three fields');
  }
  const [securityIdText, source, ms] = parts;
  const securityId = Number(securityIdText);
  const bucketStartMs = Number(ms);
  assertSecurityId(securityId);
  if (source !== 'tdx' && source !== 'qmt') {
    throw new RangeError('due member source must be tdx or qmt');
  }
  if (!Number.isSafeInteger(bucketStartMs) || bucketStartMs <= 0) {
    throw new RangeError(
      'due member bucketStartMs must be a positive safe integer',
    );
  }
  return {
    securityId,
    source,
    bucketStartMs,
  };
}

function marketSeriesPartition(
  tradingDay: string,
  source: RealtimeSource,
  securityId: number,
): string {
  assertSecurityId(securityId);
  return `${REALTIME_MARKET_REDIS_NAMESPACE}:day:${tradingDay}:${source}:${securityId}`;
}

function assertSecurityId(securityId: number): void {
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new RangeError('securityId must be a positive safe integer');
  }
}

export function assertRealtimeRedisBytes(
  label: string,
  value: string,
  maximum: number,
): void {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maximum) {
    throw new RangeError(
      `${label} is ${bytes} UTF-8 bytes; maximum is ${maximum}`,
    );
  }
}
