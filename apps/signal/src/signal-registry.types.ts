import type { DataSource, Period, StrategySignalKind } from '@app/shared-data';
import type { CompiledStrategyExecutionPlan } from '@app/strategy';
import type { ChanBspPlan } from '@app/signal';

export type SignalRegistryExecutionPlan =
  | { readonly kind: 'rule_dsl'; readonly plan: CompiledStrategyExecutionPlan }
  | { readonly kind: 'chan_bsp'; readonly plan: ChanBspPlan };

export interface SignalRegistryDefinition {
  readonly definitionId: number;
  readonly versionId: number;
  readonly signalKind: StrategySignalKind;
  readonly targetUniverse: readonly string[];
  readonly securityIds: ReadonlySet<number>;
  readonly periods: readonly Period[];
  readonly sources: readonly DataSource[];
  readonly executionPlan: SignalRegistryExecutionPlan;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export interface SignalRegistrySnapshot {
  readonly generation: number;
  readonly definitions: ReadonlyMap<number, SignalRegistryDefinition>;
}
