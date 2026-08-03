export const REALTIME_CANDLE_GRACE_LIMITS = Object.freeze({
  default: 5_000,
  min: 1_000,
  max: 30_000,
});

export const REALTIME_CANDLE_QUEUE_LIMITS = Object.freeze({
  perSeries: Object.freeze({ default: 8, min: 1, max: 256 }),
  global: Object.freeze({ default: 256, min: 16, max: 4_096 }),
});
