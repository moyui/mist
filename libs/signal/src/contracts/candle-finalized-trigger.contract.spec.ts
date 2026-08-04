import {
  CANDLE_FINALIZED_JOB_OPTIONS,
  candleFinalizedJobId,
  decodeCandleFinalizedTriggerV1,
  toStrategyTrigger,
} from './candle-finalized-trigger.contract';

const sealed = {
  contractVersion: 1,
  securityId: 9,
  source: 'tdx',
  period: '1m',
  triggerTime: '2026-08-04T06:44:00.000Z',
  outcome: 'sealed',
  triggerPrice: 28,
} as const;

describe('CandleFinalizedTriggerV1', () => {
  it('decodes a sealed trigger and creates the fixed BullMQ identity', () => {
    expect(decodeCandleFinalizedTriggerV1(sealed)).toEqual(sealed);
    expect(candleFinalizedJobId(sealed)).toBe(
      `candlefinal-v1-tdx-9-1m-${Date.parse(sealed.triggerTime)}`,
    );
    expect(toStrategyTrigger(sealed)).toEqual({
      securityId: 9,
      source: 'tdx',
      period: 1,
      timestamp: new Date(sealed.triggerTime),
      outcome: 'sealed',
    });
    expect(CANDLE_FINALIZED_JOB_OPTIONS).toEqual({
      attempts: 1,
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    });
  });

  it('accepts discarded only with a null price', () => {
    expect(
      decodeCandleFinalizedTriggerV1({
        ...sealed,
        source: 'qmt',
        outcome: 'discarded',
        triggerPrice: null,
      }),
    ).toMatchObject({ outcome: 'discarded', triggerPrice: null });
    expect(() =>
      decodeCandleFinalizedTriggerV1({
        ...sealed,
        outcome: 'discarded',
        triggerPrice: 0,
      }),
    ).toThrow('triggerPrice must be null');
  });

  it.each([
    ['extra data', { ...sealed, securityCode: '600030' }],
    ['snapshot trigger', { ...sealed, outcome: 'snapshot_update' }],
    ['non-RFC3339 time', { ...sealed, triggerTime: '2026-08-04 14:44' }],
    ['non-finite price', { ...sealed, triggerPrice: Number.NaN }],
    ['numeric source', { ...sealed, source: 1 }],
  ])('rejects %s before market resolution', (_label, input) => {
    expect(() => decodeCandleFinalizedTriggerV1(input)).toThrow();
  });
});
