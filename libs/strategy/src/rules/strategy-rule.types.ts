import type { Decimal8 } from '@app/decimal';
import type {
  StrategyFieldCatalogEntry,
  StrategyFieldPath,
} from './strategy-field.catalog';

export type StrategySignalKind = 'entry' | 'exit';

export type StrategyRuleOperator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'ne'
  | 'crossesAbove'
  | 'crossesBelow';

export interface StrategyRuleCondition {
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

export type StrategyRuleGroup =
  | { readonly all: readonly StrategyRuleExpression[] }
  | { readonly any: readonly StrategyRuleExpression[] };

export type StrategyRuleExpression = StrategyRuleCondition | StrategyRuleGroup;

export interface CompiledStrategyCondition {
  readonly kind: 'condition';
  readonly field: StrategyFieldPath;
  readonly operator: StrategyRuleOperator;
  readonly value: number | string;
  readonly decimalValue?: Decimal8;
  readonly catalog: StrategyFieldCatalogEntry;
  readonly requiredBarCount: number;
}

export interface CompiledStrategyGroup {
  readonly kind: 'all' | 'any';
  readonly children: readonly CompiledStrategyExpression[];
  readonly requiredBarCount: number;
}

export type CompiledStrategyExpression =
  | CompiledStrategyCondition
  | CompiledStrategyGroup;

export interface CompiledStrategyExecutionPlan {
  readonly signalKind: StrategySignalKind;
  readonly requiredBarCount: number;
  readonly conditionCount: number;
  readonly fields: readonly StrategyFieldPath[];
  readonly root: CompiledStrategyExpression;
}

export interface StrategyRuleCompilation {
  readonly normalizedRule: StrategyRuleExpression;
  readonly plan: CompiledStrategyExecutionPlan;
}
