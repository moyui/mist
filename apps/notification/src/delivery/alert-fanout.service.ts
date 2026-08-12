import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
} from '@app/shared-data';
import type { AlertDeliveryFanoutJobV1 } from '@app/signal';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { CHANNEL_ADAPTERS } from '../channels/channel-adapter.port';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

/**
 * Handles deliver.fanout: for one committed AlertEvent, ensures a pending
 * strategy_alert_deliveries row per enabled channel and enqueues a deliver.channel
 * job per channel (jobId dedupes re-fanout). Channel list comes from the injected
 * adapters (NOTIFICATION_CHANNELS). No configured channel => fail the event
 * (rather than leaving it PENDING forever with no delivery rows).
 */
@Injectable()
export class AlertFanoutService {
  private readonly logger = new Logger(AlertFanoutService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
    private readonly queue: AlertDeliveryQueueService,
  ) {}

  async run(job: AlertDeliveryFanoutJobV1): Promise<void> {
    const alertEventId = job.alertEventId;
    const event = await this.alertEvents.findOne({
      where: { id: alertEventId },
    });
    if (!event) return; // cascade-deleted; nothing to deliver

    if (this.adapters.length === 0) {
      this.logger.warn(
        `no notification channels configured (NOTIFICATION_CHANNELS empty) — failing event ${alertEventId}`,
      );
      await this.alertEvents.update(alertEventId, {
        status: StrategyAlertStatus.FAILED,
      });
      return;
    }

    for (const adapter of this.adapters) {
      const channel = adapter.channel;
      const existing = await this.deliveries.findOne({
        where: { strategyAlertEventId: alertEventId, channel },
      });
      if (
        existing &&
        (existing.status === StrategyAlertDeliveryStatus.SENT ||
          existing.status === StrategyAlertDeliveryStatus.DEAD_LETTERED)
      ) {
        continue; // terminal already
      }
      if (!existing) {
        try {
          await this.deliveries.save({
            strategyAlertEventId: alertEventId,
            channel,
            status: StrategyAlertDeliveryStatus.PENDING,
            attemptCount: 0,
          });
        } catch {
          // unique-constraint race (concurrent fanout); row already exists
        }
      }
      await this.queue.enqueueChannel(alertEventId, channel);
    }
  }
}
