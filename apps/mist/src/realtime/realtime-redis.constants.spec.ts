import {
  REALTIME_REDIS_RANGE_BATCH_SIZE,
  decodeDueMember,
  encodeDueMember,
} from './realtime-redis.constants';

describe('realtime Redis command and record bounds', () => {
  it('keeps the fixed due range batch at 64', () => {
    expect(REALTIME_REDIS_RANGE_BATCH_SIZE).toBe(64);
  });

  it('round-trips a bounded due member', () => {
    const encoded = encodeDueMember(1, 'tdx', '600030.SH', 1_785_202_200_000);
    expect(decodeDueMember(encoded)).toEqual({
      securityId: 1,
      source: 'tdx',
      providerSymbol: '600030.SH',
      bucketStartMs: 1_785_202_200_000,
    });
  });

  it('rejects oversized or malformed due members', () => {
    expect(() =>
      encodeDueMember(1, 'tdx', 'x'.repeat(120), 1_785_202_200_000),
    ).toThrow('maximum is 128');
    expect(() => decodeDueMember('1:tdx:600030.SH:not-a-number')).toThrow(
      'bucketStartMs must be a positive safe integer',
    );
    expect(() => decodeDueMember('1:unknown:600030.SH:1785202200000')).toThrow(
      'source must be tdx or qmt',
    );
  });
});
