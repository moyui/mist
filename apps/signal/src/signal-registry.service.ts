import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Security,
  StrategyDefinition,
  StrategyKind,
  StrategyRuleSchemaVersion,
  StrategyStatus,
} from '@app/shared-data';
import { normalizeSecurityCode } from '@app/utils';
import {
  compileStoredStrategyRuleWithNormalized,
  type StrategyRealtimeSource,
} from '@app/strategy';
import { In, Repository } from 'typeorm';
import {
  ChanBspConfigError,
  compileChanBspConfig,
  type RealtimeStrategyExecutionPlan,
  type SignalRegistryRefreshV1,
} from '@app/signal';
import { HealthStateService } from './health/health-state.service';
import type {
  SignalRegistryDefinition,
  SignalRegistryExecutionPlan,
  SignalRegistrySnapshot,
} from './signal-registry.types';
import { SignalRuntimeMutex } from './signal-runtime-mutex.service';

const REGISTRY_REFRESH_FAILED = 'REGISTRY_REFRESH_FAILED';

@Injectable()
export class SignalRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SignalRegistryService.name);
  private current: SignalRegistrySnapshot = Object.freeze({
    generation: 0,
    definitions: toImmutableMap<number, SignalRegistryDefinition>([]),
  });
  private cutoverTail: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private readonly listeners = new Set<
    (snapshot: SignalRegistrySnapshot) => void
  >();

  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitions: Repository<StrategyDefinition>,
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    private readonly healthState: HealthStateService,
    private readonly runtimeMutex: SignalRuntimeMutex,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.initialize();
  }

  initialize(): Promise<void> {
    this.initialization ??= this.loadInitialRegistry();
    return this.initialization;
  }

  /**
   * Compile with chan_bsp judgment-point logging: rejected chan_bsp configs
   * warn with a bounded reason (operator-facing), successful compiles log an
   * info lifecycle line with definition/level/units. Other compile failures
   * keep the existing registry failure semantics.
   */
  private safeCompile(
    definition: StrategyDefinition,
    securityIdsByCode: ReadonlyMap<string, number>,
  ): SignalRegistryDefinition {
    try {
      const compiled = compileRegistryDefinition(definition, securityIdsByCode);
      if (compiled.executionPlan.kind === 'chan_bsp') {
        this.logger.log(
          {
            code: 'chan_bsp_plan_compiled',
            definitionId: compiled.definitionId,
            level: definition.periods[0],
            units: compiled.executionPlan.plan.units,
          },
          'chan_bsp plan compiled',
        );
      }
      return compiled;
    } catch (error) {
      if (error instanceof ChanBspConfigError) {
        this.logger.warn(
          {
            code: 'chan_bsp_config_invalid',
            definitionId: definition.id,
            reason: error.reason,
          },
          'chan_bsp strategy config rejected',
        );
      }
      throw error;
    }
  }

  private async loadInitialRegistry(): Promise<void> {
    const definitions = await this.definitions.find({
      where: { status: StrategyStatus.ENABLED },
      relations: { currentVersion: true },
      order: { id: 'ASC' },
    });
    const securityIds = await this.resolveSecurityIds(
      definitions.flatMap((definition) => definition.targetUniverse),
    );
    const compiled = definitions.map((definition) =>
      this.safeCompile(definition, securityIds),
    );
    this.publish(new Map(compiled.map((item) => [item.definitionId, item])));
  }

  capture(): SignalRegistrySnapshot {
    return this.current;
  }

  subscribe(listener: (snapshot: SignalRegistrySnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  executionPlansFor(
    securityId: number,
    source: StrategyRealtimeSource,
  ): readonly RealtimeStrategyExecutionPlan[] {
    const snapshot = this.current;
    const plans = [...snapshot.definitions.values()]
      .filter(
        (definition) =>
          definition.securityIds.has(securityId) &&
          definition.sources.includes(source as DataSource),
      )
      .flatMap((definition) =>
        definition.periods
          .filter(
            (period) =>
              period === 1 ||
              period === 5 ||
              period === 15 ||
              period === 30 ||
              period === 60,
          )
          .map((period) =>
            Object.freeze({
              definitionId: definition.definitionId,
              versionId: definition.versionId,
              source,
              period,
              ...definition.executionPlan,
              ruleSnapshot: definition.ruleSnapshot,
            } as RealtimeStrategyExecutionPlan),
          ),
      )
      .sort(
        (left, right) =>
          left.definitionId - right.definitionId ||
          left.versionId - right.versionId ||
          left.period - right.period,
      );
    return Object.freeze(plans);
  }

  refreshDefinition(
    strategyDefinitionId: number,
  ): Promise<SignalRegistryRefreshV1> {
    return new Promise<SignalRegistryRefreshV1>((resolve, reject) => {
      const execute = async (): Promise<void> => {
        try {
          const definition = await this.definitions.findOne({
            where: { id: strategyDefinitionId },
            relations: { currentVersion: true },
          });
          const compiled =
            definition?.status === StrategyStatus.ENABLED
              ? this.safeCompile(
                  definition,
                  await this.resolveSecurityIds(definition.targetUniverse),
                )
              : null;
          let action: SignalRegistryRefreshV1['action'] = 'removed';
          await this.runtimeMutex.run(() => {
            const next = new Map(this.current.definitions);
            if (compiled) {
              next.set(strategyDefinitionId, compiled);
              action = 'upserted';
            } else {
              next.delete(strategyDefinitionId);
            }
            this.publish(next);
          });
          resolve({
            strategyDefinitionId,
            registryGeneration: this.current.generation,
            action,
          });
        } catch (error) {
          this.healthState.recordRegistryFailure(
            REGISTRY_REFRESH_FAILED,
            new Date().toISOString(),
          );
          reject(error);
        }
      };
      this.cutoverTail = this.cutoverTail.then(execute, execute);
    });
  }

  private publish(
    definitions: ReadonlyMap<number, SignalRegistryDefinition>,
  ): void {
    const generation = this.current.generation + 1;
    if (!Number.isSafeInteger(generation) || generation <= 0) {
      throw new RangeError('Signal registry generation overflow');
    }
    const immutableDefinitions = toImmutableMap(definitions);
    this.current = Object.freeze({
      generation,
      definitions: immutableDefinitions,
    });
    for (const listener of this.listeners) listener(this.current);
    this.healthState.recordRegistrySuccess(
      generation,
      immutableDefinitions.size,
      immutableDefinitions.size,
      new Date().toISOString(),
    );
  }

  private async resolveSecurityIds(
    codes: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const unique = [
      ...new Set(codes.map((code) => normalizeSecurityCode(code))),
    ].sort();
    if (unique.length === 0) return new Map();
    const rows = await this.securities.find({
      where: { code: In(unique) },
      order: { code: 'ASC' },
    });
    const resolved = new Map(rows.map((row) => [row.code, row.id]));
    if (unique.some((code) => !resolved.has(code))) {
      throw new Error('Enabled strategy target universe is unresolved');
    }
    return resolved;
  }
}

function toImmutableMap<K, V>(
  entries: Iterable<readonly [K, V]>,
): ReadonlyMap<K, V> {
  const data = new Map(entries);
  return Object.freeze({
    get size() {
      return data.size;
    },
    get(key: K) {
      return data.get(key);
    },
    has(key: K) {
      return data.has(key);
    },
    entries() {
      return data.entries();
    },
    keys() {
      return data.keys();
    },
    values() {
      return data.values();
    },
    forEach(
      callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown,
    ) {
      data.forEach((value, key) => callback.call(thisArg, value, key, this));
    },
    [Symbol.iterator]() {
      return data[Symbol.iterator]();
    },
  } satisfies ReadonlyMap<K, V>);
}

function compileRegistryDefinition(
  definition: StrategyDefinition,
  securityIdsByCode: ReadonlyMap<string, number>,
): SignalRegistryDefinition {
  const version = definition.currentVersion;
  if (!version || definition.currentVersionId !== version.id) {
    throw new Error(
      `Enabled strategy ${definition.id} has no valid current version`,
    );
  }
  if (version.ruleSchemaVersion !== StrategyRuleSchemaVersion.V1) {
    throw new Error(
      `Strategy version ${version.id} has unsupported rule schema`,
    );
  }
  const compiled: {
    executionPlan: SignalRegistryExecutionPlan;
    ruleSnapshot: Readonly<Record<string, unknown>>;
  } =
    definition.kind === StrategyKind.CHAN_BSP
      ? {
          executionPlan: {
            kind: 'chan_bsp',
            plan: compileChanBspConfig(version.rule, definition.periods),
          },
          ruleSnapshot: version.rule as Readonly<Record<string, unknown>>,
        }
      : (() => {
          const compilation = compileStoredStrategyRuleWithNormalized(
            version.rule,
            version.signalKind,
          );
          return {
            executionPlan: {
              kind: 'rule_dsl',
              plan: compilation.plan,
            },
            ruleSnapshot: compilation.normalizedRule as Readonly<
              Record<string, unknown>
            >,
          };
        })();
  return Object.freeze({
    definitionId: definition.id,
    versionId: version.id,
    signalKind: version.signalKind,
    targetUniverse: Object.freeze([...definition.targetUniverse]),
    securityIds: toImmutableSet(
      definition.targetUniverse.map(
        (code) => securityIdsByCode.get(normalizeSecurityCode(code))!,
      ),
    ),
    periods: Object.freeze([...definition.periods]),
    sources: Object.freeze([...definition.sources]),
    executionPlan: compiled.executionPlan,
    ruleSnapshot: compiled.ruleSnapshot,
  });
}

function toImmutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const data = new Set(values);
  return Object.freeze({
    get size() {
      return data.size;
    },
    has(value: T) {
      return data.has(value);
    },
    entries() {
      return data.entries();
    },
    keys() {
      return data.keys();
    },
    values() {
      return data.values();
    },
    forEach(
      callback: (value: T, valueAgain: T, set: ReadonlySet<T>) => void,
      thisArg?: unknown,
    ) {
      data.forEach((value) => callback.call(thisArg, value, value, this));
    },
    [Symbol.iterator]() {
      return data[Symbol.iterator]();
    },
  } satisfies ReadonlySet<T>);
}
