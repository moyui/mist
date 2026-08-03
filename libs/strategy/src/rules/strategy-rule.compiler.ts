import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import {
  STRATEGY_FIELD_CATALOG,
  type StrategyFieldCatalogEntry,
  type StrategyFieldPath,
} from './strategy-field.catalog';
import type {
  CompiledStrategyCondition,
  CompiledStrategyExecutionPlan,
  CompiledStrategyExpression,
  CompiledStrategyGroup,
  StrategyRuleCompilation,
  StrategyRuleExpression,
  StrategyRuleOperator,
  StrategySignalKind,
} from './strategy-rule.types';

export const MAX_STRATEGY_RULE_DEPTH = 8;
export const MAX_STRATEGY_RULE_CONDITIONS = 64;

type DecimalBoundary = 'create' | 'stored';

interface CompilationState {
  conditionCount: number;
  readonly fields: Set<StrategyFieldPath>;
  readonly decimalBoundary: DecimalBoundary;
}

interface NodeCompilation {
  readonly normalized: StrategyRuleExpression;
  readonly compiled: CompiledStrategyExpression;
}

export function compileStrategyRuleForCreate(
  rule: unknown,
  signalKind: StrategySignalKind,
): StrategyRuleCompilation {
  return compileStrategyRule(rule, signalKind, 'create');
}

export function compileStoredStrategyRule(
  rule: unknown,
  signalKind: StrategySignalKind,
): CompiledStrategyExecutionPlan {
  return compileStrategyRule(rule, signalKind, 'stored').plan;
}

function compileStrategyRule(
  rule: unknown,
  signalKind: StrategySignalKind,
  decimalBoundary: DecimalBoundary,
): StrategyRuleCompilation {
  assertSignalKind(signalKind);
  const state: CompilationState = {
    conditionCount: 0,
    fields: new Set<StrategyFieldPath>(),
    decimalBoundary,
  };
  const root = compileNode(rule, 1, state);
  const fields = Object.freeze([...state.fields].sort());
  const plan = Object.freeze({
    signalKind,
    requiredBarCount: root.compiled.requiredBarCount,
    conditionCount: state.conditionCount,
    fields,
    root: root.compiled,
  } satisfies CompiledStrategyExecutionPlan);

  return Object.freeze({
    normalizedRule: root.normalized,
    plan,
  });
}

function compileNode(
  input: unknown,
  depth: number,
  state: CompilationState,
): NodeCompilation {
  if (depth > MAX_STRATEGY_RULE_DEPTH) {
    throw new RangeError(
      `strategy rule depth exceeds ${MAX_STRATEGY_RULE_DEPTH}`,
    );
  }
  if (!isRecord(input)) {
    throw new TypeError('strategy rule node must be a non-array object');
  }

  const keys = Object.keys(input);
  if (keys.length === 1 && (keys[0] === 'all' || keys[0] === 'any')) {
    return compileGroup(input, keys[0], depth, state);
  }
  if (hasExactKeys(keys, ['field', 'operator', 'value'])) {
    return compileCondition(input, state);
  }
  throw new TypeError(
    'strategy rule node must be exactly one group key or field/operator/value',
  );
}

function compileGroup(
  input: Record<string, unknown>,
  kind: 'all' | 'any',
  depth: number,
  state: CompilationState,
): NodeCompilation {
  const children = input[kind];
  if (!Array.isArray(children) || children.length === 0) {
    throw new TypeError(`strategy ${kind} group must be a non-empty array`);
  }

  const compiledChildren = children.map((child) =>
    compileNode(child, depth + 1, state),
  );
  const normalizedChildren = Object.freeze(
    compiledChildren.map((child) => child.normalized),
  );
  const executionChildren = Object.freeze(
    compiledChildren.map((child) => child.compiled),
  );
  const requiredBarCount = Math.max(
    ...executionChildren.map((child) => child.requiredBarCount),
  );

  return {
    normalized: Object.freeze({
      [kind]: normalizedChildren,
    }) as StrategyRuleExpression,
    compiled: Object.freeze({
      kind,
      children: executionChildren,
      requiredBarCount,
    } satisfies CompiledStrategyGroup),
  };
}

function compileCondition(
  input: Record<string, unknown>,
  state: CompilationState,
): NodeCompilation {
  state.conditionCount += 1;
  if (state.conditionCount > MAX_STRATEGY_RULE_CONDITIONS) {
    throw new RangeError(
      `strategy rule condition count exceeds ${MAX_STRATEGY_RULE_CONDITIONS}`,
    );
  }
  if (
    typeof input.field !== 'string' ||
    !(input.field in STRATEGY_FIELD_CATALOG)
  ) {
    throw new TypeError(`unsupported strategy field: ${String(input.field)}`);
  }
  const field = input.field as StrategyFieldPath;
  const catalog = STRATEGY_FIELD_CATALOG[field];
  if (
    typeof input.operator !== 'string' ||
    !(catalog.operators as readonly StrategyRuleOperator[]).includes(
      input.operator as StrategyRuleOperator,
    )
  ) {
    throw new TypeError(
      `unsupported operator ${String(input.operator)} for ${field}`,
    );
  }
  const operator = input.operator as StrategyRuleOperator;
  const threshold = compileThreshold(
    input.value,
    catalog,
    state.decimalBoundary,
  );
  const requiredBarCount =
    catalog.calculationBarCount + (isCrossover(operator) ? 1 : 0);
  state.fields.add(field);

  const normalized = Object.freeze({
    field,
    operator,
    value: threshold.serialized,
  });
  const compiled = Object.freeze({
    kind: 'condition',
    field,
    operator,
    value: threshold.serialized,
    ...(threshold.decimalValue === undefined
      ? {}
      : { decimalValue: threshold.decimalValue }),
    catalog,
    requiredBarCount,
  } satisfies CompiledStrategyCondition);

  return { normalized, compiled };
}

function compileThreshold(
  value: unknown,
  catalog: StrategyFieldCatalogEntry,
  decimalBoundary: DecimalBoundary,
): { readonly serialized: number | string; readonly decimalValue?: Decimal8 } {
  if (catalog.valueType === 'finiteNumber') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('finite-number strategy threshold is required');
    }
    return { serialized: value };
  }
  if (catalog.valueType === 'barType') {
    if (value !== 'complete' && value !== 'incomplete') {
      throw new TypeError('k.type threshold must be complete or incomplete');
    }
    return { serialized: value };
  }
  if (typeof value !== 'string') {
    throw new TypeError('decimal strategy threshold must be a string');
  }

  const canonical =
    decimalBoundary === 'create'
      ? normalizeExternalDecimalText(value)
      : Decimal8.parseCanonical(value).formatCanonical();
  const decimalValue = Decimal8.parseCanonical(canonical);
  return { serialized: canonical, decimalValue };
}

function assertSignalKind(value: unknown): asserts value is StrategySignalKind {
  if (value !== 'entry' && value !== 'exit') {
    throw new TypeError('strategy signal kind must be entry or exit');
  }
}

function isCrossover(operator: StrategyRuleOperator): boolean {
  return operator === 'crossesAbove' || operator === 'crossesBelow';
}

function hasExactKeys(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualKeys = [...actual].sort();
  const expectedKeys = [...expected].sort();
  return actualKeys.every((key, index) => key === expectedKeys[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
