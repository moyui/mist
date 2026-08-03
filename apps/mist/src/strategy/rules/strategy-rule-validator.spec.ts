import { BadRequestException } from '@nestjs/common';
import { StrategyRuleValidator } from './strategy-rule-validator';

describe('StrategyRuleValidator', () => {
  let validator: StrategyRuleValidator;

  beforeEach(() => {
    validator = new StrategyRuleValidator();
  });

  it('accepts declarative expressions over approved field roots', () => {
    const summary = validator.validate({
      all: [
        { field: 'k.close', operator: 'gt', value: 10 },
        {
          field: 'indicator.macd.histogram',
          operator: 'crossesAbove',
          value: 0,
        },
        {
          any: [
            { field: 'chan.bi.direction', operator: 'eq', value: 'up' },
            { field: 'security.type', operator: 'eq', value: 'STOCK' },
          ],
        },
      ],
    });

    expect(summary).toEqual({
      ruleSchemaVersion: 'v1',
      conditionCount: 4,
      fieldRoots: ['chan', 'indicator', 'k', 'security'],
      operators: ['crossesAbove', 'eq', 'gt'],
    });
  });

  it('rejects unsupported operators before persistence', () => {
    expect(() =>
      validator.validate({
        field: 'k.close',
        operator: 'eval',
        value: 'close > 10',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects arbitrary executable code fields', () => {
    expect(() =>
      validator.validate({
        language: 'javascript',
        code: 'return k.close > 10',
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['numeric threshold', 100],
    ['signed text', '+100'],
    ['fixed-scale non-canonical text', '100.00000000'],
    ['negative text', '-1'],
  ])('rejects a %s for decimal quantity rules', (_, value) => {
    expect(() =>
      validator.validate({ field: 'k.volume', operator: 'gt', value }),
    ).toThrow(BadRequestException);
  });

  it('accepts canonical decimal quantity thresholds in schema v1', () => {
    expect(
      validator.validate({
        field: 'k.amount',
        operator: 'gte',
        value: '9007199254740992.00000001',
      }),
    ).toEqual({
      ruleSchemaVersion: 'v1',
      conditionCount: 1,
      fieldRoots: ['k'],
      operators: ['gte'],
    });
  });
});
