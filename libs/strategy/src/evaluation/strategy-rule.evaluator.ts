import { Decimal8, type Decimal8Comparison } from '@app/decimal';
import type {
  CompiledStrategyCondition,
  CompiledStrategyExecutionPlan,
  CompiledStrategyExpression,
  StrategyRuleOperator,
} from '../rules/strategy-rule.types';
import {
  buildStrategyEvaluationContext,
  type StrategyAnalysisObservationCache,
} from './strategy-context.builder';
import type {
  StrategyEvaluationContext,
  StrategyEvaluationOutcome,
  StrategyFieldObservation,
} from './strategy-evaluation.types';
import type { ProjectedStrategyBar } from '@app/market-data';

export function evaluateStrategyPlan(
  plan: CompiledStrategyExecutionPlan,
  projectedBars: readonly ProjectedStrategyBar[],
  analysis?: StrategyAnalysisObservationCache,
): StrategyEvaluationOutcome {
  const prepared = buildStrategyEvaluationContext(
    plan,
    projectedBars,
    analysis,
  );
  if (prepared.status === 'unavailable') return prepared;

  return Object.freeze({
    status: 'evaluated',
    matched: evaluateNode(plan.root, prepared.context),
    context: prepared.context,
  });
}

function evaluateNode(
  node: CompiledStrategyExpression,
  context: StrategyEvaluationContext,
): boolean {
  if (node.kind === 'condition') {
    return evaluateCondition(node, requireObservation(context, node.field));
  }
  if (node.kind === 'all') {
    return node.children.every((child) => evaluateNode(child, context));
  }
  return node.children.some((child) => evaluateNode(child, context));
}

function evaluateCondition(
  condition: CompiledStrategyCondition,
  observation: StrategyFieldObservation,
): boolean {
  if (condition.catalog.valueType === 'decimal') {
    if (!condition.decimalValue) {
      throw new Error('compiled decimal condition has no Decimal8 threshold');
    }
    const current = Decimal8.parseCanonical(requireString(observation.current));
    const previous =
      observation.previous === undefined
        ? undefined
        : Decimal8.parseCanonical(requireString(observation.previous));
    return compare(
      condition.operator,
      current.compare(condition.decimalValue),
      previous?.compare(condition.decimalValue),
    );
  }
  if (condition.catalog.valueType === 'finiteNumber') {
    const current = requireFiniteNumber(observation.current);
    const previous =
      observation.previous === undefined
        ? undefined
        : requireFiniteNumber(observation.previous);
    return compareNumber(
      condition.operator,
      current,
      condition.value,
      previous,
    );
  }

  const current = requireString(observation.current);
  if (condition.operator === 'eq') return current === condition.value;
  if (condition.operator === 'ne') return current !== condition.value;
  throw new Error('compiled bar type condition has an invalid operator');
}

function compareNumber(
  operator: StrategyRuleOperator,
  current: number,
  threshold: number | string,
  previous?: number,
): boolean {
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new Error('compiled finite-number threshold is invalid');
  }
  const currentComparison: Decimal8Comparison =
    current < threshold ? -1 : current > threshold ? 1 : 0;
  const previousComparison =
    previous === undefined
      ? undefined
      : previous < threshold
        ? -1
        : previous > threshold
          ? 1
          : 0;
  return compare(operator, currentComparison, previousComparison);
}

function compare(
  operator: StrategyRuleOperator,
  current: Decimal8Comparison,
  previous?: Decimal8Comparison,
): boolean {
  switch (operator) {
    case 'gt':
      return current > 0;
    case 'gte':
      return current >= 0;
    case 'lt':
      return current < 0;
    case 'lte':
      return current <= 0;
    case 'eq':
      return current === 0;
    case 'ne':
      return current !== 0;
    case 'crossesAbove':
      if (previous === undefined)
        throw new Error('crossover has no prior value');
      return previous <= 0 && current > 0;
    case 'crossesBelow':
      if (previous === undefined)
        throw new Error('crossover has no prior value');
      return previous >= 0 && current < 0;
  }
}

function requireObservation(
  context: StrategyEvaluationContext,
  field: CompiledStrategyCondition['field'],
): StrategyFieldObservation {
  const observation = context.fields[field];
  if (!observation) {
    throw new Error(`compiled context is missing ${field}`);
  }
  return observation;
}

function requireFiniteNumber(value: number | string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('strategy numeric observation must be finite');
  }
  return value;
}

function requireString(value: number | string): string {
  if (typeof value !== 'string') {
    throw new TypeError('strategy string observation is required');
  }
  return value;
}
