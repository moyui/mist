import type { DataSource, Period, StrategySignalKind } from '@app/shared-data';
import type { CompiledStrategyExecutionPlan } from '@app/strategy';

export interface SignalRegistryDefinition {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: StrategySignalKind;
  readonly targetUniverse: readonly string[];
  readonly securityIds: ReadonlySet<number>;
  readonly periods: readonly Period[];
  readonly sources: readonly DataSource[];
  readonly executionPlan: CompiledStrategyExecutionPlan;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export interface SignalRegistrySnapshot {
  readonly generation: number;
  readonly definitions: ReadonlyMap<number, SignalRegistryDefinition>;
}
