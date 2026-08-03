import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  K,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategyDefinition,
  StrategySignal,
  StrategySignalSource,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { RunStrategyScanDto } from '../dto/run-strategy-scan.dto';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';
import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';
import { StrategyScanResult } from './strategy-scan.types';

@Injectable()
export class StrategyScanService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    @InjectRepository(StrategySignal)
    private readonly signalRepository: Repository<StrategySignal>,
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEventRepository: Repository<StrategyAlertEvent>,
    private readonly contextBuilder: StrategyEvaluationContextBuilder,
    private readonly ruleEvaluator: StrategyRuleEvaluator,
  ) {}

  async runScan(dto: RunStrategyScanDto): Promise<StrategyScanResult> {
    const result: StrategyScanResult = {
      scannedStrategies: 0,
      evaluatedContexts: 0,
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 0,
    };
    const definitions = await this.findEnabledDefinitions(dto);

    result.scannedStrategies = definitions.length;

    for (const definition of definitions) {
      const version = await this.loadCurrentVersion(definition);

      const periods = dto.period ? [dto.period] : definition.periods;
      const sources = dto.source ? [dto.source] : definition.sources;

      for (const securityCode of definition.targetUniverse) {
        for (const period of periods) {
          for (const source of sources) {
            const k = await this.loadLatestK(securityCode, period, source);
            if (!k) continue;

            result.evaluatedContexts += 1;
            const context = this.contextBuilder.buildFromK(k);
            const evaluation = this.ruleEvaluator.evaluate(
              version.rule,
              context as unknown as Record<string, unknown>,
            );
            if (!evaluation.matched) continue;

            const dedupeKey = this.buildDedupeKey(
              definition,
              version,
              k.security.id,
              period,
              source,
              k.timestamp,
            );
            const duplicate = await this.alertEventRepository.findOne({
              where: { dedupeKey },
            });
            if (duplicate) {
              result.skippedDuplicates += 1;
              continue;
            }

            try {
              await this.signalRepository.manager.transaction(
                async (manager) => {
                  const signalRepository =
                    manager.getRepository(StrategySignal);
                  const alertEventRepository =
                    manager.getRepository(StrategyAlertEvent);
                  const signal = await signalRepository.save(
                    signalRepository.create({
                      strategyDefinitionId: definition.id,
                      strategyVersionId: version.id,
                      securityId: k.security.id,
                      period,
                      source,
                      signalTime: k.timestamp,
                      signalSource: StrategySignalSource.LIVE,
                      signalKind: version.signalKind,
                      contextSnapshot: context,
                      ruleSnapshot: version.rule,
                    }),
                  );
                  await alertEventRepository.save(
                    alertEventRepository.create({
                      strategySignalId: signal.id,
                      status: StrategyAlertStatus.PENDING,
                      dedupeKey,
                    }),
                  );
                },
              );
            } catch (error) {
              if (this.isAlertDedupeConflict(error)) {
                result.skippedDuplicates += 1;
                continue;
              }
              throw error;
            }
            result.createdSignals += 1;
            result.createdAlertEvents += 1;
          }
        }
      }
    }

    return result;
  }

  private async findEnabledDefinitions(
    dto: RunStrategyScanDto,
  ): Promise<StrategyDefinition[]> {
    const where: FindOptionsWhere<StrategyDefinition> = {
      status: StrategyStatus.ENABLED,
    };

    if (dto.strategyDefinitionId !== undefined) {
      where.id = dto.strategyDefinitionId;
    }

    return await this.definitionRepository.find({
      where,
      order: { id: 'ASC' },
    });
  }

  private async loadCurrentVersion(
    definition: StrategyDefinition,
  ): Promise<StrategyVersion> {
    if (definition.currentVersionId == null) {
      throw new ConflictException(
        `Enabled strategy definition ${definition.id} has no current version`,
      );
    }
    const version = await this.versionRepository.findOne({
      where: {
        id: definition.currentVersionId,
        strategyDefinitionId: definition.id,
      },
    });
    if (!version) {
      throw new ConflictException(
        `Enabled strategy definition ${definition.id} current version ${definition.currentVersionId} is missing or belongs to another definition`,
      );
    }
    return version;
  }

  private async loadLatestK(
    securityCode: string,
    period: K['period'],
    source: K['source'],
  ): Promise<K | null> {
    return await this.kRepository.findOne({
      where: {
        security: { code: securityCode },
        period,
        source,
      },
      relations: ['security'],
      order: { timestamp: 'DESC' },
    });
  }

  private buildDedupeKey(
    definition: StrategyDefinition,
    version: StrategyVersion,
    securityId: number,
    period: K['period'],
    source: K['source'],
    signalTime: Date,
  ): string {
    return [
      definition.id,
      version.id,
      securityId,
      period,
      source,
      signalTime.toISOString(),
    ].join(':');
  }

  private isAlertDedupeConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      sqlMessage?: unknown;
    };
    if (driverError.code !== 'ER_DUP_ENTRY' && driverError.errno !== 1062) {
      return false;
    }
    const message = [driverError.message, driverError.sqlMessage]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    return message.includes('uq_strategy_alert_events_dedupe_key');
  }
}
