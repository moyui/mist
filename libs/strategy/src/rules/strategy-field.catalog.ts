import { STRATEGY_KDJ_CALCULATION_BAR_COUNT } from '../analysis/strategy-kdj';
import { STRATEGY_MACD_CALCULATION_BAR_COUNT } from '../analysis/strategy-macd';
import type { StrategyRuleOperator } from './strategy-rule.types';

export type StrategyFieldValueType = 'finiteNumber' | 'decimal' | 'barType';

export interface StrategyFieldCatalogEntry {
  readonly valueType: StrategyFieldValueType;
  readonly calculationBarCount: number;
  readonly operators: readonly StrategyRuleOperator[];
  readonly missingPolicy?: 'forwardFillWithinTradingDay';
}

const DIRECT_NUMBER_OPERATORS = Object.freeze([
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'ne',
  'crossesAbove',
  'crossesBelow',
] as const satisfies readonly StrategyRuleOperator[]);

const INDICATOR_OPERATORS = Object.freeze([
  'gt',
  'gte',
  'lt',
  'lte',
  'crossesAbove',
  'crossesBelow',
] as const satisfies readonly StrategyRuleOperator[]);

const BAR_TYPE_OPERATORS = Object.freeze([
  'eq',
  'ne',
] as const satisfies readonly StrategyRuleOperator[]);

const directNumber = (): StrategyFieldCatalogEntry =>
  Object.freeze({
    valueType: 'finiteNumber',
    calculationBarCount: 1,
    operators: DIRECT_NUMBER_OPERATORS,
  });

const decimalQuantity = (): StrategyFieldCatalogEntry =>
  Object.freeze({
    valueType: 'decimal',
    calculationBarCount: 1,
    operators: DIRECT_NUMBER_OPERATORS,
    missingPolicy: 'forwardFillWithinTradingDay',
  });

const kdj = (): StrategyFieldCatalogEntry =>
  Object.freeze({
    valueType: 'finiteNumber',
    calculationBarCount: STRATEGY_KDJ_CALCULATION_BAR_COUNT,
    operators: INDICATOR_OPERATORS,
  });

const macd = (): StrategyFieldCatalogEntry =>
  Object.freeze({
    valueType: 'finiteNumber',
    calculationBarCount: STRATEGY_MACD_CALCULATION_BAR_COUNT,
    operators: INDICATOR_OPERATORS,
  });

export const STRATEGY_FIELD_CATALOG = Object.freeze({
  'k.open': directNumber(),
  'k.high': directNumber(),
  'k.low': directNumber(),
  'k.close': directNumber(),
  'k.volume': decimalQuantity(),
  'k.amount': decimalQuantity(),
  'k.type': Object.freeze({
    valueType: 'barType',
    calculationBarCount: 1,
    operators: BAR_TYPE_OPERATORS,
  }),
  'indicator.kdj.k': kdj(),
  'indicator.kdj.d': kdj(),
  'indicator.kdj.j': kdj(),
  'indicator.macd.line': macd(),
  'indicator.macd.signal': macd(),
  'indicator.macd.histogram': macd(),
} as const satisfies Record<string, StrategyFieldCatalogEntry>);

export type StrategyFieldPath = keyof typeof STRATEGY_FIELD_CATALOG;

export const STRATEGY_FIELD_PATHS = Object.freeze(
  Object.keys(STRATEGY_FIELD_CATALOG) as StrategyFieldPath[],
);
