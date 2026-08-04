import type { CompiledStrategyExecutionPlan } from '../rules/strategy-rule.types';
import type { StrategyEvaluationContext } from './strategy-evaluation.types';

export function serializeStrategyContextSnapshot(
  plan: CompiledStrategyExecutionPlan,
  context: StrategyEvaluationContext,
): Readonly<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    k: { type: context.barType },
  };
  const previous: Record<string, unknown> = {};

  for (const field of plan.fields) {
    const observation = context.fields[field];
    if (!observation) {
      throw new Error(`strategy context snapshot is missing ${field}`);
    }
    setNestedValue(snapshot, field, observation.current);
    if (observation.previous !== undefined) {
      setNestedValue(previous, field, observation.previous);
    }
  }
  if (Object.keys(previous).length > 0) {
    snapshot.previous = previous;
  }
  if (context.quantityEvidence) {
    snapshot.quantityEvidence = context.quantityEvidence;
  }

  return deepFreeze(snapshot);
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string,
  value: number | string,
): void {
  const segments = path.split('.');
  let cursor = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    const existing = cursor[segment];
    if (existing === undefined) {
      const nested: Record<string, unknown> = {};
      cursor[segment] = nested;
      cursor = nested;
      return;
    }
    if (typeof existing !== 'object' || existing === null) {
      throw new Error(`strategy context snapshot path conflict at ${segment}`);
    }
    cursor = existing as Record<string, unknown>;
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
