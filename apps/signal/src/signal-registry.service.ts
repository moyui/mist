import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategyStatus,
} from '@app/shared-data';
import { compileStoredStrategyRule } from '@app/strategy';
import { Repository } from 'typeorm';
import type { SignalRegistryRefreshV1 } from '@app/signal';
import { SignalHealthStateService } from './signal-health-state.service';
import type {
  SignalRegistryDefinition,
  SignalRegistrySnapshot,
} from './signal-registry.types';

const REGISTRY_REFRESH_FAILED = 'REGISTRY_REFRESH_FAILED';

@Injectable()
export class SignalRegistryService implements OnApplicationBootstrap {
  private current: SignalRegistrySnapshot = Object.freeze({
    generation: 0,
    definitions: toImmutableMap<number, SignalRegistryDefinition>([]),
  });
  private cutoverTail: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitions: Repository<StrategyDefinition>,
    private readonly healthState: SignalHealthStateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const definitions = await this.definitions.find({
      where: { status: StrategyStatus.ENABLED },
      relations: { currentVersion: true },
      order: { id: 'ASC' },
    });
    const compiled = definitions.map((definition) =>
      compileRegistryDefinition(definition),
    );
    this.publish(new Map(compiled.map((item) => [item.definitionId, item])));
  }

  capture(): SignalRegistrySnapshot {
    return this.current;
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
          const next = new Map(this.current.definitions);
          let action: SignalRegistryRefreshV1['action'] = 'removed';
          if (definition?.status === StrategyStatus.ENABLED) {
            next.set(
              strategyDefinitionId,
              compileRegistryDefinition(definition),
            );
            action = 'upserted';
          } else {
            next.delete(strategyDefinitionId);
          }
          this.publish(next);
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
    this.healthState.recordRegistrySuccess(
      generation,
      immutableDefinitions.size,
      immutableDefinitions.size,
      new Date().toISOString(),
    );
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
  const executionPlan = compileStoredStrategyRule(
    version.rule,
    version.signalKind,
  );
  return Object.freeze({
    definitionId: definition.id,
    versionId: version.id,
    signalKind: version.signalKind,
    targetUniverse: Object.freeze([...definition.targetUniverse]),
    periods: Object.freeze([...definition.periods]),
    sources: Object.freeze([...definition.sources]),
    executionPlan,
  });
}
