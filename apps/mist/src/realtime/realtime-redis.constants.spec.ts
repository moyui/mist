import {
  REALTIME_MARKET_REDIS_NAMESPACE,
  REALTIME_REDIS_RANGE_BATCH_SIZE,
  closedCandleKey,
  decodeDueMember,
  encodeDueMember,
  manifestKey,
  marketDayExpiryEpochSeconds,
  watermarkKey,
} from './realtime-redis.constants';

describe('realtime Redis command and record bounds', () => {
  it('keeps the fixed due range batch at 64', () => {
    expect(REALTIME_REDIS_RANGE_BATCH_SIZE).toBe(64);
  });

  it('round-trips a bounded due member', () => {
    const encoded = encodeDueMember(1, 'tdx', 1_785_202_200_000);
    expect(decodeDueMember(encoded)).toEqual({
      securityId: 1,
      source: 'tdx',
      bucketStartMs: 1_785_202_200_000,
    });
  });

  it('rejects oversized or malformed due members', () => {
    expect(() => decodeDueMember('x'.repeat(129))).toThrow('maximum is 128');
    expect(() => decodeDueMember('1:tdx:not-a-number')).toThrow(
      'bucketStartMs must be a positive safe integer',
    );
    expect(() => decodeDueMember('1:unknown:1785202200000')).toThrow(
      'source must be tdx or qmt',
    );
  });

  it('uses canonical securityId and source in every market-series key', () => {
    const keys = [
      closedCandleKey('20260728', 'tdx', 7),
      watermarkKey('20260728', 'tdx', 7),
      manifestKey('20260728', 'tdx', 7),
    ];
    for (const key of keys) {
      expect(key).toContain(':tdx:7:');
      expect(key).not.toContain('600030.SH');
      expect(key.startsWith(`${REALTIME_MARKET_REDIS_NAMESPACE}:`)).toBe(true);
      expect(key.startsWith('bull:')).toBe(false);
    }
    expect(closedCandleKey('20260728', 'qmt', 7)).not.toBe(keys[0]);
  });

  it('expires day D exactly at Shanghai D+1 midnight', () => {
    expect(marketDayExpiryEpochSeconds('20260728')).toBe(
      Date.parse('2026-07-29T00:00:00+08:00') / 1_000,
    );
    expect(marketDayExpiryEpochSeconds('20260131')).toBe(
      Date.parse('2026-02-01T00:00:00+08:00') / 1_000,
    );
    expect(() => marketDayExpiryEpochSeconds('2026-07-28')).toThrow('YYYYMMDD');
    expect(() => marketDayExpiryEpochSeconds('20260231')).toThrow(
      'tradingDay is invalid',
    );
  });
});
