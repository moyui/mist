import { StrategyRuleEvaluator } from './strategy-rule-evaluator';

describe('StrategyRuleEvaluator', () => {
  let evaluator: StrategyRuleEvaluator;

  beforeEach(() => {
    evaluator = new StrategyRuleEvaluator();
  });

  it('matches declarative expressions against K-line and security context', () => {
    const result = evaluator.evaluate(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 100 },
          { field: 'security.code', operator: 'eq', value: '600519' },
        ],
      },
      {
        k: { close: 120 },
        security: { code: '600519' },
      },
    );

    expect(result).toEqual({ matched: true });
  });

  it('returns a non-match when any required condition fails', () => {
    const result = evaluator.evaluate(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 100 },
          { field: 'security.code', operator: 'eq', value: '600519' },
        ],
      },
      {
        k: { close: 80 },
        security: { code: '600519' },
      },
    );

    expect(result).toEqual({ matched: false });
  });

  it('does not coerce a missing numeric measure to zero', () => {
    const result = evaluator.evaluate(
      { field: 'k.amount', operator: 'lte', value: 0 },
      { k: { amount: null } },
    );

    expect(result).toEqual({ matched: false });
  });
});
