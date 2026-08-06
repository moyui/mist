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

  it('rejects offset and high-precision fe/le instants (TDX eventTime regression)', () => {
    // The wire contract accepts ±HH:MM, but the sealed contract is strict
    // UTC Z with at most 3 fractional digits. 2026-08-06 on-HIL caught TDX
    // records sealed with '+08:00' being rejected here.
    expect(() =>
      decodeRealtimeClosedCandleRecordV1({
        ...record,
        fe: '2026-08-04T09:30:01+08:00',
      }),
    ).toThrow('Invalid closed-candle metadata');
    expect(() =>
      decodeRealtimeClosedCandleRecordV1({
        ...record,
        le: '2026-08-04T01:30:01.1234Z',
      }),
    ).toThrow('Invalid closed-candle metadata');
  });
});
