/**
 * Compatibility barrel for the candle app. The Redis wire contract lives in
 * a pure shared library so the writer and Signal reader cannot drift.
 */
export {
  REALTIME_MARKET_REDIS_NAMESPACE,
  REALTIME_REDIS_RANGE_BATCH_SIZE,
  REALTIME_REDIS_RECORD_LIMITS,
  assertRealtimeRedisBytes,
  closedCandleKey,
  decodeDueMember,
  dueKey,
  encodeDueMember,
  manifestKey,
  marketDayExpiryEpochSeconds,
  watermarkKey,
} from '@app/realtime';
