import {
  closedCandleKey,
  decodeRealtimeClosedCandleRecordV1,
} from './realtime-candle-redis.contract';

describe('realtime candle Redis wire contract', () => {
  const record = {
    o: 10,
    h: 11,
    l: 9,
    c: 10.5,
    v: '100',
    a: null,
    cv: '1200',
    ca: null,
    cs: null,
    fe: '2026-08-04T01:30:01.000Z',
    le: '2026-08-04T01:30:59.000Z',
    q: 'provisional',
  } as const;

  it('decodes the exact record emitted by the candle writer', () => {
    expect(decodeRealtimeClosedCandleRecordV1(record)).toEqual(record);
    expect(closedCandleKey('20260804', 'tdx', 9)).toBe(
      'mist:realtime:v1:day:20260804:tdx:9:candle:1m:closed',
    );
  });

  it.each([
    { ...record, c: Number.NaN },
    { ...record, v: 100 },
    { ...record, v: '01' },
    { ...record, q: 'complete' },
    { ...record, extra: true },
  ])('rejects malformed or non-canonical record %#', (value) => {
    expect(() => decodeRealtimeClosedCandleRecordV1(value)).toThrow();
  });
});
