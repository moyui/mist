import { RealtimePeriodBuilder, REALTIME_STRATEGY_PERIODS } from '@app/signal';
import type { StrategyBar, StrategyTrigger } from '@app/strategy';
import { resolveCandleBucket } from './candle-bucket.util';

/**
 * Seam alignment test: the producer bucket universe MUST be a subset of the
 * consumer's accepted session.
 *
 * The producer (`resolveCandleBucket`) and the Signal consumer
 * (`RealtimePeriodBuilder.sessionPosition`, exercised through `accept`) used
 * to disagree at the session-terminal minutes (11:30/15:00) and the
 * close-delay dead minutes (15:01/15:02), which surfaced as
 * `RangeError: finalized strategy trigger is outside A-share sessions` in
 * production (run 31084479412). This test pins the 242-bucket alignment:
 * every producer-legal bucket minute must be accepted by the consumer, and
 * garbage minutes must produce no bucket at all.
 */

const sh = (h: number, m: number): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `2026-07-28T${pad(h)}:${pad(m)}:00+08:00`;
};

function acceptProbe(minuteOfDay: number): boolean {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const iso = sh(hour, minute);
  const bucket = resolveCandleBucket(iso);
  if (bucket === null) return false;

  const bar: StrategyBar = {
    securityId: 1,
    source: 'tdx',
    period: 1,
    timestamp: new Date(bucket.bucketStartMs),
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: '0',
    amount: '0',
    type: 'complete',
  };
  const trigger: StrategyTrigger = {
    securityId: 1,
    source: 'tdx',
    period: 1,
    timestamp: new Date(bucket.bucketStartMs),
    outcome: 'sealed',
  };
  try {
    new RealtimePeriodBuilder().accept(trigger, bar, new Set([1] as const));
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

describe('producer/consumer session seam (242 buckets)', () => {
  it('every producer-legal bucket minute is accepted by the Signal consumer', () => {
    let producerBucketCount = 0;
    const rejected: number[] = [];

    // Full minute domain 09:00 → 15:30 CST.
    for (let minuteOfDay = 9 * 60; minuteOfDay <= 15 * 60 + 30; minuteOfDay++) {
      const iso = sh(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
      const bucket = resolveCandleBucket(iso);
      if (bucket === null) continue;
      producerBucketCount++;
      if (!acceptProbe(minuteOfDay)) {
        rejected.push(minuteOfDay);
      }
    }

    expect(producerBucketCount).toBe(242);
    expect(rejected).toEqual([]);
  });

  it('garbage minutes produce no bucket (pre-open / lunch / deep post-close)', () => {
    const garbageMinutes = [
      9 * 60, // 09:00 pre-open
      9 * 60 + 29, // 09:29 pre-open
      11 * 60 + 31, // 11:31 lunch
      12 * 60, // 12:00 lunch
      13 * 60 - 1, // 12:59 lunch
      15 * 60 + 1, // 15:01 deep post-close
      15 * 60 + 30, // 15:30 deep post-close
    ];
    for (const minuteOfDay of garbageMinutes) {
      const iso = sh(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
      expect(resolveCandleBucket(iso)).toBeNull();
    }
  });

  it('counts exactly 242 legal buckets across both sessions', () => {
    let count = 0;
    for (let minuteOfDay = 9 * 60; minuteOfDay <= 15 * 60 + 30; minuteOfDay++) {
      const iso = sh(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
      if (resolveCandleBucket(iso) !== null) count++;
    }
    expect(count).toBe(242);
  });

  it('REALTIME_STRATEGY_PERIODS contains 1m as the consumer baseline', () => {
    expect(REALTIME_STRATEGY_PERIODS).toContain(1);
  });
});
