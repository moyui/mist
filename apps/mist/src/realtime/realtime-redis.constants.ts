import type { RealtimeSource } from './realtime.types';

/**
 * Redis key builders for the current-day realtime candle product (B1).
 *
 * All keys live under the `mist:realtime:v1` namespace and are targeted at
 * `MIST_REALTIME_REDIS_URL` (a physically separate instance from any future
 * `mist-queue-redis`). Key shapes are frozen by B1 design so that the
 * post-close sync change can parse the partition manifest and delete exactly
 * the keys it names.
 *
 * Field semantics (see design.md "Node.js latest 与 Redis key/TTL"):
 * - `tradingDay`   — `YYYYMMDD` in Asia/Shanghai, derived from eventTime.
 * - `source`       — `'tdx' | 'qmt'` (partition metadata, not query identity).
 * - `providerSymbol` — source-specific formatCode, e.g. `300502.SZ`.
 */

const NAMESPACE = 'mist:realtime:v1';

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
  providerSymbol: string,
): string {
  return `${NAMESPACE}:day:${tradingDay}:${source}:${providerSymbol}:candle:1m:closed`;
}

/**
 * Per-symbol sealing watermark. Records the last sealed-through bucket,
 * outcome (closed/discarded), closing cumulative totals, stream epoch and
 * last sequence. Prevents a restarted process from reopening a sealed bucket.
 */
export function watermarkKey(
  tradingDay: string,
  source: RealtimeSource,
  providerSymbol: string,
): string {
  return `${NAMESPACE}:day:${tradingDay}:${source}:${providerSymbol}:candle:1m:watermark`;
}

/**
 * Per-symbol partition manifest. Lists the structured Redis keys belonging to
 * this `tradingDay + source + providerSymbol` partition, so the post-close
 * sync change can delete them precisely without wildcards.
 */
export function manifestKey(
  tradingDay: string,
  source: RealtimeSource,
  providerSymbol: string,
): string {
  return `${NAMESPACE}:day:${tradingDay}:${source}:${providerSymbol}:manifest`;
}

/**
 * Global due ZSET for the trading day. Score = bucket cutoff epoch ms;
 * member encodes which symbol+source+bucket is awaiting finalization. The
 * due scanner reads this with `ZRANGEBYSCORE` up to the Node clock's `now()`.
 */
export function dueKey(tradingDay: string): string {
  return `${NAMESPACE}:day:${tradingDay}:candle:1m:due`;
}

/** Target expiry point for any current-day key: trading-day end + 72h. */
export const RETENTION_AFTER_DAY_END_HOURS = 72;

/**
 * Due ZSET member encoding. Members must carry enough identity for the due
 * scanner to route the finalize task into the correct per-securityId keyed
 * queue (design line 57) and resolve Redis partition keys.
 *
 * Format: `securityId:source:providerSymbol:bucketStartMs`
 */
export function encodeDueMember(
  securityId: number,
  source: RealtimeSource,
  providerSymbol: string,
  bucketStartMs: number,
): string {
  const member = `${securityId}:${source}:${providerSymbol}:${bucketStartMs}`;
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
  providerSymbol: string;
  bucketStartMs: number;
} {
  assertRealtimeRedisBytes(
    'due member',
    member,
    REALTIME_REDIS_RECORD_LIMITS.dueMember,
  );
  const parts = member.split(':');
  if (parts.length !== 4) {
    throw new RangeError('due member must contain exactly four fields');
  }
  const [securityIdText, source, providerSymbol, ms] = parts;
  const securityId = Number(securityIdText);
  const bucketStartMs = Number(ms);
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new RangeError(
      'due member securityId must be a positive safe integer',
    );
  }
  if (source !== 'tdx' && source !== 'qmt') {
    throw new RangeError('due member source must be tdx or qmt');
  }
  if (!providerSymbol) {
    throw new RangeError('due member providerSymbol must be non-empty');
  }
  if (!Number.isSafeInteger(bucketStartMs) || bucketStartMs <= 0) {
    throw new RangeError(
      'due member bucketStartMs must be a positive safe integer',
    );
  }
  return {
    securityId,
    source,
    providerSymbol,
    bucketStartMs,
  };
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
