import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationChannel,
  Security,
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';
import type { AlertDeliveryChannelJobV1 } from '@app/signal';
import {
  CHANNEL_ADAPTERS,
  type ChannelAdapter,
  type ChannelSendResult,
} from '../channels/channel-adapter.port';
import { buildNotificationEnvelope } from './notification-envelope';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

const MAX_LAST_ERROR = 1024;

/**
 * Handles deliver.channel: loads evidence, builds the channel-neutral envelope,
 * calls the channel adapter, writes the per-channel delivery result, records
 * metrics, and reconciles the AlertEvent aggregate status. Transient failures
 * throw so BullMQ retries; permanent failures and exhausted retries dead-letter
 * without throwing (job completes; the DB row is the source of truth).
 */
@Injectable()
export class AlertChannelDeliveryService {
  private readonly logger = new Logger(AlertChannelDeliveryService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategySignal)
    private readonly signals: Repository<StrategySignal>,
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitions: Repository<StrategyDefinition>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
    private readonly counters: NotificationDeliveryCounters,
  ) {}

  async run(
    job: AlertDeliveryChannelJobV1,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    const { alertEventId } = job;
    // Bridge the contract's pure literal union to the NotificationChannel enum
    // (used by the entity column + adapters). Values are guaranteed equal by decode.
    const channel = toNotificationChannel(job.channel);
    const delivery = await this.deliveries.findOne({
      where: { strategyAlertEventId: alertEventId, channel },
    });
    if (!delivery) return;
    if (
      delivery.status === StrategyAlertDeliveryStatus.SENT ||
      delivery.status === StrategyAlertDeliveryStatus.DEAD_LETTERED
    ) {
      return; // idempotent skip
    }

    const adapter = this.adapters.find((a) => a.channel === channel);
    if (!adapter) {
      // Short-circuit before loading evidence: no adapter for this channel.
      this.counters.recordDeadLetter(channel);
      await this.markDelivery(
        delivery.id,
        StrategyAlertDeliveryStatus.DEAD_LETTERED,
        delivery.attemptCount,
        `no adapter configured for channel ${channel}`,
      );
      await this.reconcile(alertEventId);
      return;
    }

    const alertEvent = await this.alertEvents.findOne({
      where: { id: alertEventId },
    });
    if (!alertEvent) return;
    const signal = await this.signals.findOne({
      where: { id: alertEvent.strategySignalId },
    });
    const security = signal
      ? await this.securities.findOne({ where: { id: signal.securityId } })
      : null;
    const strategyDefinition = signal
      ? await this.strategyDefinitions.findOne({
          where: { id: signal.strategyDefinitionId },
        })
      : null;

    const envelope = buildNotificationEnvelope(
      alertEvent,
      signal,
      security,
      strategyDefinition,
      channel,
    );
    const attemptNo = delivery.attemptCount + 1;
    let result: ChannelSendResult;
    try {
      result = await adapter.send(envelope);
    } catch (error) {
      result = {
        status: 'transient_failure',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.counters.recordAttempt(channel);

    if (result.status === 'sent') {
      this.counters.recordSent(channel);
      await this.deliveries.update(delivery.id, {
        status: StrategyAlertDeliveryStatus.SENT,
        attemptCount: attemptNo,
        providerMessageId: result.providerMessageId ?? null,
        sentAt: new Date(),
        lastError: null,
      });
      await this.reconcile(alertEventId);
      this.logger.log(
        `delivered event=${alertEventId} channel=${channel} attempt=${attemptNo}`,
      );
      return;
    }

    const isLastAttempt = attemptsMade + 1 >= maxAttempts;
    const terminal = result.status === 'permanent_failure' || isLastAttempt;
    const newStatus = terminal
      ? StrategyAlertDeliveryStatus.DEAD_LETTERED
      : StrategyAlertDeliveryStatus.FAILED;
    this.counters.recordFailure(channel);
    await this.markDelivery(delivery.id, newStatus, attemptNo, result.error);
    await this.reconcile(alertEventId);

    if (result.status === 'transient_failure' && !terminal) {
      throw new Error(
        `transient delivery failure channel=${channel} event=${alertEventId}: ${result.error ?? 'unknown'}`,
      );
    }
    this.counters.recordDeadLetter(channel);
    this.logger.warn(
      `delivery dead-lettered channel=${channel} event=${alertEventId} attempt=${attemptNo}: ${result.error ?? 'exhausted retries'}`,
    );
  }

  private async markDelivery(
    id: number,
    status: StrategyAlertDeliveryStatus,
    attemptCount: number,
    error?: string,
  ): Promise<void> {
    await this.deliveries.update(id, {
      status,
      attemptCount,
      lastError: truncate(error),
    });
  }

  private async reconcile(alertEventId: number): Promise<void> {
    const all = await this.deliveries.find({
      where: { strategyAlertEventId: alertEventId },
    });
    if (all.length === 0) return;
    const anyDeadLetter = all.some(
      (d) => d.status === StrategyAlertDeliveryStatus.DEAD_LETTERED,
    );
    const allSent = all.every(
      (d) => d.status === StrategyAlertDeliveryStatus.SENT,
    );
    let next: StrategyAlertStatus | null = null;
    if (anyDeadLetter) next = StrategyAlertStatus.FAILED;
    else if (allSent) next = StrategyAlertStatus.DELIVERED;
    if (next) await this.alertEvents.update(alertEventId, { status: next });
  }
}

function truncate(error?: string): string | null {
  if (!error) return null;
  return error.length > MAX_LAST_ERROR ? error.slice(0, MAX_LAST_ERROR) : error;
}

function toNotificationChannel(channel: 'qq' | 'wechat'): NotificationChannel {
  return channel === 'qq' ? NotificationChannel.QQ : NotificationChannel.WECHAT;
}
