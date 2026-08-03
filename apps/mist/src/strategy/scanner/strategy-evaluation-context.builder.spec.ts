import { K } from '@app/shared-data';
import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';

describe('StrategyEvaluationContextBuilder', () => {
  it('preserves canonical quantities supplied by the TypeORM entity boundary', () => {
    const k = Object.assign(new K(), {
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: '100',
      amount: '9007199254740992.00000001',
      timestamp: new Date('2026-07-04T09:30:00.000Z'),
      security: { code: '600519', type: 'STOCK' },
    });

    expect(new StrategyEvaluationContextBuilder().buildFromK(k).k).toEqual({
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: '100',
      amount: '9007199254740992.00000001',
      timestamp: new Date('2026-07-04T09:30:00.000Z'),
    });
  });

  it('preserves missing quantities as null', () => {
    const k = Object.assign(new K(), {
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: null,
      amount: null,
      timestamp: new Date('2026-07-04T09:30:00.000Z'),
      security: { code: '600519', type: 'STOCK' },
    });

    expect(new StrategyEvaluationContextBuilder().buildFromK(k).k).toEqual(
      expect.objectContaining({ volume: null, amount: null }),
    );
  });
});
