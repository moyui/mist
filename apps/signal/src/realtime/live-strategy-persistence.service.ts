import { Injectable } from '@nestjs/common';
import {
  DataSource as MarketDataSource,
  Period,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategySignal,
  StrategySignalKind,
  StrategySignalSource,
} from '@app/shared-data';
import type { ShadowStrategyCandidate } from '@app/signal';
import { DataSource as TypeOrmDataSource, QueryFailedError } from 'typeorm';

export type LiveStrategyPersistenceOutcome =
  | 'created'
  | 'duplicate_skipped';

const ALERT_DEDUPE_CONSTRAINT = 'uq_strategy_alert_events_dedupe_key';

@Injectable()
export class LiveStrategyPersistenceService {
  constructor(private readonly dataSource: TypeOrmDataSource) {}

  async persist(
    candidate: ShadowStrategyCandidate,
  ): Promise<LiveStrategyPersistenceOutcome> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query('SET SESSION innodb_lock_wait_timeout = 3');
        const signal = manager.create(StrategySignal, {
          strategyDefinitionId: candidate.definitionId,
          strategyVersionId: candidate.versionId,
          securityId: candidate.securityId,
          period: candidate.period as Period,
          source: candidate.source as MarketDataSource,
          signalTime: candidate.signalTime,
          signalSource: StrategySignalSource.LIVE,
          signalKind: candidate.signalKind as StrategySignalKind,
          contextSnapshot: {
            ...candidate.contextSnapshot,
            triggerTime: candidate.triggerTime,
            triggerPrice: candidate.triggerPrice,
          },
          ruleSnapshot: { ...candidate.ruleSnapshot },
        });
        const savedSignal = await manager.save(StrategySignal, signal);
        const alert = manager.create(StrategyAlertEvent, {
          strategySignalId: savedSignal.id,
          status: StrategyAlertStatus.PENDING,
          dedupeKey: liveStrategyAlertDedupeKey(candidate),
          cooldownUntil: null,
          deliveryResult: null,
          acknowledgedAt: null,
        });
        await manager.save(StrategyAlertEvent, alert);
      });
      return 'created';
    } catch (error) {
      if (isNamedAlertDedupeConflict(error)) return 'duplicate_skipped';
      throw error;
    }
  }
}

export function liveStrategyAlertDedupeKey(
  candidate: Pick<
    ShadowStrategyCandidate,
    | 'definitionId'
    | 'versionId'
    | 'securityId'
    | 'source'
    | 'period'
    | 'signalKind'
    | 'signalTime'
  >,
): string {
  return [
    'live-v1',
    candidate.definitionId,
    candidate.versionId,
    candidate.securityId,
    candidate.source,
    candidate.period,
    candidate.signalKind,
    candidate.signalTime.getTime(),
  ].join(':');
}

export function isNamedAlertDedupeConflict(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as {
    code?: unknown;
    errno?: unknown;
    sqlMessage?: unknown;
  };
  if (driver.code !== 'ER_DUP_ENTRY' || driver.errno !== 1062) return false;
  if (typeof driver.sqlMessage !== 'string') return false;
  const match = /for key '([^']+)'\s*$/.exec(driver.sqlMessage);
  if (!match) return false;
  const exactName = match[1].split('.').at(-1);
  return exactName === ALERT_DEDUPE_CONSTRAINT;
}
