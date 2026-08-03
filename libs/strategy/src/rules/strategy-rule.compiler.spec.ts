import { Decimal8 } from '@app/decimal';
import {
  STRATEGY_FIELD_CATALOG,
  STRATEGY_FIELD_PATHS,
} from './strategy-field.catalog';
import {
  MAX_STRATEGY_RULE_CONDITIONS,
  MAX_STRATEGY_RULE_DEPTH,
  compileStoredStrategyRule,
  compileStrategyRuleForCreate,
} from './strategy-rule.compiler';

describe('strategy field catalog', () => {
  it('contains exactly the reviewed V1 fields', () => {
    expect(STRATEGY_FIELD_PATHS).toEqual([
      'k.open',
      'k.high',
      'k.low',
      'k.close',
      'k.volume',
      'k.amount',
      'k.type',
      'indicator.kdj.k',
      'indicator.kdj.d',
      'indicator.kdj.j',
      'indicator.macd.line',
      'indicator.macd.signal',
      'indicator.macd.histogram',
    ]);
  });

  it('fixes field value types, calculation demands and operators', () => {
    expect(STRATEGY_FIELD_CATALOG['k.close']).toEqual({
      valueType: 'finiteNumber',
      calculationBarCount: 1,
      operators: [
        'gt',
        'gte',
        'lt',
        'lte',
        'eq',
        'ne',
        'crossesAbove',
        'crossesBelow',
      ],
    });
    expect(STRATEGY_FIELD_CATALOG['k.volume']).toEqual({
      valueType: 'decimal',
      calculationBarCount: 1,
      operators: [
        'gt',
        'gte',
        'lt',
        'lte',
        'eq',
        'ne',
        'crossesAbove',
        'crossesBelow',
      ],
      missingPolicy: 'forwardFillWithinTradingDay',
    });
    expect(STRATEGY_FIELD_CATALOG['k.type']).toEqual({
      valueType: 'barType',
      calculationBarCount: 1,
      operators: ['eq', 'ne'],
    });
    expect(STRATEGY_FIELD_CATALOG['indicator.kdj.k']).toEqual({
      valueType: 'finiteNumber',
      calculationBarCount: 13,
      operators: ['gt', 'gte', 'lt', 'lte', 'crossesAbove', 'crossesBelow'],
    });
    expect(STRATEGY_FIELD_CATALOG['indicator.macd.line']).toEqual({
      valueType: 'finiteNumber',
      calculationBarCount: 130,
      operators: ['gt', 'gte', 'lt', 'lte', 'crossesAbove', 'crossesBelow'],
    });
  });
});

describe('strategy rule compiler', () => {
  it('normalizes decimal text only at the create boundary', () => {
    const compilation = compileStrategyRuleForCreate(
      { field: 'k.volume', operator: 'gte', value: '001.2300' },
      'entry',
    );

    expect(compilation.normalizedRule).toEqual({
      field: 'k.volume',
      operator: 'gte',
      value: '1.23',
    });
    expect(compilation.plan.signalKind).toBe('entry');
    expect(compilation.plan.requiredBarCount).toBe(1);
    expect(compilation.plan.root).toMatchObject({
      field: 'k.volume',
      value: '1.23',
    });
    const decimalValue =
      compilation.plan.root.kind === 'condition'
        ? compilation.plan.root.decimalValue
        : undefined;
    expect(decimalValue).toBeInstanceOf(Decimal8);
    expect(decimalValue?.formatCanonical()).toBe('1.23');
  });

  it('accepts only canonical decimal strings at stored/load boundaries', () => {
    expect(
      compileStoredStrategyRule(
        { field: 'k.amount', operator: 'eq', value: '0' },
        'exit',
      ),
    ).toMatchObject({ signalKind: 'exit', requiredBarCount: 1 });
    expect(() =>
      compileStoredStrategyRule(
        { field: 'k.amount', operator: 'eq', value: '0.0' },
        'exit',
      ),
    ).toThrow(TypeError);
  });

  it.each([
    1,
    -1,
    '+1',
    '-0',
    ' 1',
    '1 ',
    '.5',
    '1.',
    '1e2',
    '1.000000000',
    '0'.repeat(38),
    '１２',
  ])('rejects unsupported create decimal threshold %p', (value) => {
    expect(() =>
      compileStrategyRuleForCreate(
        { field: 'k.volume', operator: 'gt', value },
        'entry',
      ),
    ).toThrow();
  });

  it('requires finite numeric and exact enum thresholds', () => {
    expect(() =>
      compileStoredStrategyRule(
        { field: 'k.close', operator: 'gt', value: Number.NaN },
        'entry',
      ),
    ).toThrow(TypeError);
    expect(() =>
      compileStoredStrategyRule(
        { field: 'k.type', operator: 'eq', value: 'unknown' },
        'entry',
      ),
    ).toThrow(TypeError);
  });

  it.each([
    { field: 'k.close', operator: 'neq', value: 1 },
    { field: 'k.type', operator: 'in', value: ['complete'] },
    { field: 'indicator.kdj.k', operator: 'eq', value: 1 },
    { field: 'chan.bi.count', operator: 'gt', value: 1 },
    { field: 'security.code', operator: 'eq', value: '600000' },
    { field: 'k.timestamp', operator: 'gt', value: 1 },
  ])('fails closed on an unreviewed field/operator shape %#', (rule) => {
    expect(() => compileStoredStrategyRule(rule, 'entry')).toThrow(TypeError);
  });

  it.each([
    null,
    [],
    {},
    { all: [] },
    { all: [{}], any: [{}] },
    { field: 'k.close', operator: 'gt' },
    { field: 'k.close', operator: 'gt', value: 1, metadata: {} },
    { field: 'k.close', operator: 'gt', value: 1, lookbackBars: 2 },
    { all: [{ field: 'k.close', operator: 'gt', value: 1 }], metadata: {} },
  ])('rejects a node without the exact reviewed shape %#', (rule) => {
    expect(() => compileStoredStrategyRule(rule, 'entry')).toThrow();
  });

  it('uses max child demand and adds one bar only for crossover', () => {
    const plan = compileStoredStrategyRule(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 10 },
          {
            any: [
              { field: 'indicator.kdj.k', operator: 'lt', value: 20 },
              {
                field: 'indicator.macd.histogram',
                operator: 'crossesAbove',
                value: 0,
              },
            ],
          },
        ],
      },
      'entry',
    );

    expect(plan.requiredBarCount).toBe(131);
    expect(plan.conditionCount).toBe(3);
    expect(plan.fields).toEqual([
      'indicator.kdj.k',
      'indicator.macd.histogram',
      'k.close',
    ]);
  });

  it.each([
    ['k.close', 'gt', 1],
    ['k.close', 'crossesBelow', 2],
    ['indicator.kdj.d', 'gte', 13],
    ['indicator.kdj.d', 'crossesAbove', 14],
    ['indicator.macd.signal', 'lt', 130],
    ['indicator.macd.signal', 'crossesBelow', 131],
  ] as const)(
    'compiles %s %s to requiredBarCount=%s',
    (field, operator, expected) => {
      expect(
        compileStoredStrategyRule({ field, operator, value: 1 }, 'entry')
          .requiredBarCount,
      ).toBe(expected);
    },
  );

  it('accepts depth 8 and rejects depth 9', () => {
    expect(
      compileStoredStrategyRule(nestedRule(MAX_STRATEGY_RULE_DEPTH), 'entry'),
    ).toMatchObject({ conditionCount: 1 });
    expect(() =>
      compileStoredStrategyRule(
        nestedRule(MAX_STRATEGY_RULE_DEPTH + 1),
        'entry',
      ),
    ).toThrow(RangeError);
  });

  it('accepts 64 conditions and rejects the 65th', () => {
    const condition = { field: 'k.close', operator: 'gt', value: 1 };
    expect(
      compileStoredStrategyRule(
        {
          all: Array.from(
            { length: MAX_STRATEGY_RULE_CONDITIONS },
            () => condition,
          ),
        },
        'entry',
      ),
    ).toMatchObject({ conditionCount: 64 });
    expect(() =>
      compileStoredStrategyRule(
        {
          all: Array.from(
            { length: MAX_STRATEGY_RULE_CONDITIONS + 1 },
            () => condition,
          ),
        },
        'entry',
      ),
    ).toThrow(RangeError);
  });

  it('returns a deeply frozen execution plan and serializable normalized rule', () => {
    const compilation = compileStrategyRuleForCreate(
      {
        all: [
          { field: 'k.volume', operator: 'gt', value: '001.20' },
          { field: 'k.close', operator: 'gt', value: 10 },
        ],
      },
      'entry',
    );

    expect(Object.isFrozen(compilation)).toBe(true);
    expect(Object.isFrozen(compilation.plan)).toBe(true);
    expect(Object.isFrozen(compilation.plan.root)).toBe(true);
    expect(
      compilation.plan.root.kind === 'all' &&
        Object.isFrozen(compilation.plan.root.children),
    ).toBe(true);
    expect(JSON.stringify(compilation.normalizedRule)).toContain('"1.2"');
    expect(() => JSON.stringify(compilation.plan)).toThrow(TypeError);
  });

  it.each(['entry', 'exit'] as const)(
    'carries signal kind %s into the plan',
    (kind) => {
      expect(
        compileStoredStrategyRule(
          { field: 'k.close', operator: 'gt', value: 1 },
          kind,
        ).signalKind,
      ).toBe(kind);
    },
  );

  it('rejects a runtime signal-kind compatibility alias', () => {
    expect(() =>
      compileStoredStrategyRule(
        { field: 'k.close', operator: 'gt', value: 1 },
        'buy' as never,
      ),
    ).toThrow(TypeError);
  });
});

function nestedRule(depth: number): Record<string, unknown> {
  let rule: Record<string, unknown> = {
    field: 'k.close',
    operator: 'gt',
    value: 1,
  };
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
    rule = { all: [rule] };
  }
  return rule;
}
