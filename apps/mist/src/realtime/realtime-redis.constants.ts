import type { RealtimeSource } from './realtime-native-frame';

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
 * Due ZSET member encoding. Members must be stable and unique per
 * symbol+source+bucket so the finalizer can recover partition identity.
 */
export function encodeDueMember(
  source: RealtimeSource,
  providerSymbol: string,
  bucketStartMs: number,
): string {
  return `${source}:${providerSymbol}:${bucketStartMs}`;
}

/** Inverse of {@link encodeDueMember}. */
export function decodeDueMember(member: string): {
  source: RealtimeSource;
  providerSymbol: string;
  bucketStartMs: number;
} {
  const [source, providerSymbol, ms] = member.split(':');
  return {
    source: source as RealtimeSource,
    providerSymbol,
    bucketStartMs: Number(ms),
  };
}
