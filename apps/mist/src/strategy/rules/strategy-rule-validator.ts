import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal8 } from '@app/decimal';
import {
  StrategyRuleOperator,
  StrategyRuleValidationSummary,
} from './strategy-rule.types';

const ALLOWED_FIELD_ROOTS = ['k', 'indicator', 'chan', 'security'] as const;
const ALLOWED_OPERATORS: StrategyRuleOperator[] = [
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'neq',
  'crossesAbove',
  'crossesBelow',
];
const EXECUTABLE_KEYS = ['code', 'script', 'language', 'sql', 'function'];
const DECIMAL_QUANTITY_FIELDS = new Set(['k.volume', 'k.amount']);

@Injectable()
export class StrategyRuleValidator {
  validate(rule: unknown): StrategyRuleValidationSummary {
    const fieldRoots = new Set<string>();
    const operators = new Set<StrategyRuleOperator>();
    const conditionCount = this.visit(rule, fieldRoots, operators);

    if (conditionCount === 0) {
      throw new BadRequestException(
        'Strategy rule must contain at least one condition',
      );
    }

    return {
      ruleSchemaVersion: 'v1',
      conditionCount,
      fieldRoots: [...fieldRoots].sort(),
      operators: [...operators].sort(),
    };
  }

  private visit(
    node: unknown,
    fieldRoots: Set<string>,
    operators: Set<StrategyRuleOperator>,
  ): number {
    if (!this.isRecord(node)) {
      throw new BadRequestException('Strategy rule nodes must be objects');
    }

    this.assertNoExecutableKeys(node);

    if ('all' in node || 'any' in node) {
      return this.visitGroup(node, fieldRoots, operators);
    }

    return this.visitCondition(node, fieldRoots, operators);
  }

  private visitGroup(
    node: Record<string, unknown>,
    fieldRoots: Set<string>,
    operators: Set<StrategyRuleOperator>,
  ): number {
    const all = node.all;
    const any = node.any;

    if (all !== undefined && any !== undefined) {
      throw new BadRequestException(
        'Strategy rule group must use either all or any, not both',
      );
    }

    const children = all ?? any;
    if (!Array.isArray(children) || children.length === 0) {
      throw new BadRequestException(
        'Strategy rule group must contain at least one child expression',
      );
    }

    return children.reduce(
      (count, child) => count + this.visit(child, fieldRoots, operators),
      0,
    );
  }

  private visitCondition(
    node: Record<string, unknown>,
    fieldRoots: Set<string>,
    operators: Set<StrategyRuleOperator>,
  ): number {
    if (typeof node.field !== 'string' || node.field.length === 0) {
      throw new BadRequestException('Strategy condition field is required');
    }
    if (
      typeof node.operator !== 'string' ||
      !ALLOWED_OPERATORS.includes(node.operator as StrategyRuleOperator)
    ) {
      throw new BadRequestException(
        `Unsupported strategy operator: ${String(node.operator)}`,
      );
    }
    if (!('value' in node)) {
      throw new BadRequestException('Strategy condition value is required');
    }
    this.assertDecimalQuantityThreshold(node);

    const [root] = node.field.split('.');
    if (
      !ALLOWED_FIELD_ROOTS.includes(
        root as (typeof ALLOWED_FIELD_ROOTS)[number],
      )
    ) {
      throw new BadRequestException(`Unsupported strategy field root: ${root}`);
    }

    fieldRoots.add(root);
    operators.add(node.operator as StrategyRuleOperator);
    return 1;
  }

  private assertDecimalQuantityThreshold(node: Record<string, unknown>): void {
    if (!DECIMAL_QUANTITY_FIELDS.has(node.field as string)) return;
    if (typeof node.value !== 'string') {
      throw new BadRequestException(
        `${node.field as string} strategy threshold must be a canonical decimal string`,
      );
    }
    try {
      Decimal8.parseCanonical(node.value);
    } catch {
      throw new BadRequestException(
        `${node.field as string} strategy threshold must be a canonical decimal string`,
      );
    }
  }

  private assertNoExecutableKeys(node: Record<string, unknown>): void {
    const executableKey = EXECUTABLE_KEYS.find((key) => key in node);
    if (executableKey) {
      throw new BadRequestException(
        `Executable strategy field is not allowed: ${executableKey}`,
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
