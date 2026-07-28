import { Injectable } from '@nestjs/common';

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
    const actual = this.getPathValue(context, String(condition.field));
    const expected = condition.value;

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
