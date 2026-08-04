import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyVersion,
} from '@app/shared-data';
import {
  compileStoredStrategyRule,
  compileStrategyRuleForCreate,
  type CompiledStrategyExecutionPlan,
  type StrategyRuleCompilation,
  type StrategySignalKind as DomainStrategySignalKind,
} from '@app/strategy';

const QUANTITY_FIELDS = new Set(['k.volume', 'k.amount']);

@Injectable()
export class StrategyExecutionPlanService {
  compileForCreate(
    rule: unknown,
    signalKind: StrategySignalKind,
  ): StrategyRuleCompilation {
    try {
      return compileStrategyRuleForCreate(
        rule,
        signalKind as DomainStrategySignalKind,
      );
    } catch (error) {
      throw new BadRequestException(toErrorMessage(error));
    }
  }

  compileStoredVersion(
    version: StrategyVersion,
  ): CompiledStrategyExecutionPlan {
    if (version.ruleSchemaVersion !== StrategyRuleSchemaVersion.V1) {
      throw new Error(
        `Strategy version ${version.id} has unsupported rule schema ${String(version.ruleSchemaVersion)}`,
      );
    }
    return compileStoredStrategyRule(
      version.rule,
      version.signalKind as DomainStrategySignalKind,
    );
  }

  compileForRealtimeRegistration(
    version: StrategyVersion,
  ): CompiledStrategyExecutionPlan {
    const plan = this.compileStoredVersion(version);
    if (plan.fields.some((field) => QUANTITY_FIELDS.has(field))) {
      throw new ConflictException(
        'Realtime quantity strategy registration is unavailable until the TDX/QMT quantity profile HIL is approved',
      );
    }
    return plan;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid strategy rule';
}
