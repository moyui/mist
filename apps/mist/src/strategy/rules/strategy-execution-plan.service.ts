import { BadRequestException, Injectable } from '@nestjs/common';
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
    return this.compileStoredVersion(version);
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid strategy rule';
}
