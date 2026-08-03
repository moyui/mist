import { Injectable } from '@nestjs/common';
import { Decimal8, Decimal8Comparison } from '@app/decimal';

const DECIMAL_QUANTITY_FIELDS = new Set(['k.volume', 'k.amount']);

export type StrategyRuleEvaluationResult = {
  matched: boolean;
};

@Injectable()
export class StrategyRuleEvaluator {
  evaluate(
    rule: Record<string, unknown>,
    context: Record<string, unknown>,
  ): StrategyRuleEvaluationResult {
    return { matched: this.evaluateNode(rule, context) };
  }

  private evaluateNode(
    node: Record<string, unknown>,
    context: Record<string, unknown>,
  ): boolean {
    if (Array.isArray(node.all)) {
      return node.all.every((child) =>
        this.evaluateNode(child as Record<string, unknown>, context),
      );
    }
    if (Array.isArray(node.any)) {
      return node.any.some((child) =>
        this.evaluateNode(child as Record<string, unknown>, context),
      );
    }

    return this.evaluateCondition(node, context);
  }

  private evaluateCondition(
    condition: Record<string, unknown>,
    context: Record<string, unknown>,
  ): boolean {
    const field = String(condition.field);
    const actual = this.getPathValue(context, field);
    const expected = condition.value;

    if (DECIMAL_QUANTITY_FIELDS.has(field)) {
      return this.evaluateDecimalQuantity(condition.operator, actual, expected);
    }

    switch (condition.operator) {
      case 'gt':
        if (actual == null) return false;
        return Number(actual) > Number(expected);
      case 'gte':
        if (actual == null) return false;
        return Number(actual) >= Number(expected);
      case 'lt':
        if (actual == null) return false;
        return Number(actual) < Number(expected);
      case 'lte':
        if (actual == null) return false;
        return Number(actual) <= Number(expected);
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'crossesAbove':
      case 'crossesBelow':
        return false;
      default:
        return false;
    }
  }

  private evaluateDecimalQuantity(
    operator: unknown,
    actual: unknown,
    expected: unknown,
  ): boolean {
    if (actual === null || actual === undefined) return false;
    const comparison = Decimal8.parseCanonical(actual as string).compare(
      Decimal8.parseCanonical(expected as string),
    );

    return compareDecimal(operator, comparison);
  }

  private getPathValue(
    context: Record<string, unknown>,
    path: string,
  ): unknown {
    return path.split('.').reduce<unknown>((value, segment) => {
      if (typeof value !== 'object' || value === null) return undefined;
      return (value as Record<string, unknown>)[segment];
    }, context);
  }
}

function compareDecimal(
  operator: unknown,
  comparison: Decimal8Comparison,
): boolean {
  switch (operator) {
    case 'gt':
      return comparison > 0;
    case 'gte':
      return comparison >= 0;
    case 'lt':
      return comparison < 0;
    case 'lte':
      return comparison <= 0;
    case 'eq':
      return comparison === 0;
    case 'neq':
      return comparison !== 0;
    case 'crossesAbove':
    case 'crossesBelow':
    default:
      return false;
  }
}
