import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DataSource as MarketDataSource,
  Period,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategySignal,
  StrategySignalKind,
  StrategySignalSource,
  isUniqueConstraintViolation,
} from '@app/shared-data';
import type { ShadowStrategyCandidate } from '@app/signal';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import {
  STRATEGY_ALERT_DELIVERY_HANDOFF_PORT,
  type StrategyAlertDeliveryHandoffPort,
} from './notification/strategy-alert-delivery-handoff.port';

export type LiveStrategyPersistenceOutcome = 'created' | 'duplicate_skipped';

const ALERT_DEDUPE_CONSTRAINT = 'uq_strategy_alert_events_dedupe_key';

@Injectable()
export class LiveStrategyPersistenceService {
  private readonly logger = new Logger(LiveStrategyPersistenceService.name);

  constructor(
    private readonly dataSource: TypeOrmDataSource,
    @Optional()
    @Inject(STRATEGY_ALERT_DELIVERY_HANDOFF_PORT)
    private readonly deliveryHandoff: StrategyAlertDeliveryHandoffPort | null = null,
  ) {}

  async persist(
    candidate: ShadowStrategyCandidate,
  ): Promise<LiveStrategyPersistenceOutcome> {
    let alertEventId: number | null = null;
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
        const savedAlert = await manager.save(StrategyAlertEvent, alert);
        alertEventId = savedAlert.id;
      });
      // Post-commit enqueue (best-effort): the Signal/AlertEvent is already
      // committed; an enqueue failure MUST NOT fail persist. The event remains
      // PENDING for a later reconciliation sweep (dual-write window accepted).
      await this.enqueueDelivery(alertEventId);
      return 'created';
    } catch (error) {
      if (isUniqueConstraintViolation(error, ALERT_DEDUPE_CONSTRAINT)) {
        return 'duplicate_skipped';
      }
      throw error;
    }
  }

  private async enqueueDelivery(alertEventId: number | null): Promise<void> {
    if (alertEventId === null || this.deliveryHandoff === null) return;
    try {
      await this.deliveryHandoff.publish(alertEventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to enqueue alert delivery for event ${alertEventId} ` +
          `(Signal already committed; event stays PENDING for later sweep): ${message}`,
      );
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
