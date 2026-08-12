import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { parseRedisConnectionUrl } from '@app/realtime';
import {
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
  alertDeliveryChannelJobId,
  decodeAlertDeliveryChannelJobV1,
  type AlertDeliveryChannelJobV1,
  type AlertDeliveryFanoutJobV1,
} from '@app/signal';
import {
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
} from '@app/shared-data';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { CHANNEL_ADAPTERS } from '../channels/channel-adapter.port';

/**
 * Handles deliver.fanout: for one committed AlertEvent, ensures a pending
 * strategy_alert_deliveries row per enabled channel and enqueues a deliver.channel
 * job per channel (jobId dedupes re-fanout). Channel list comes from the injected
 * adapters (configured channels). Uses a dedicated fail-fast Queue because the
 * worker side runs BullModule consumer forRootAsync with manualRegistration.
 */
@Injectable()
export class AlertFanoutService implements OnModuleDestroy {
  private readonly queue: Queue<AlertDeliveryChannelJobV1>;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
  ) {
    this.queue = new Queue(STRATEGY_ALERT_DELIVERY_QUEUE_NAME, {
      connection: {
        ...parseRedisConnectionUrl(
          this.config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
        ),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        commandTimeout: 3_000,
      },
      prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
    });
  }

  async run(job: AlertDeliveryFanoutJobV1): Promise<void> {
    const alertEventId = job.alertEventId;
    const event = await this.alertEvents.findOne({
      where: { id: alertEventId },
    });
    if (!event) return; // cascade-deleted; nothing to deliver

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
      const channelJob: AlertDeliveryChannelJobV1 = {
        contractVersion: 1,
        alertEventId,
        channel,
      };
      const accepted = decodeAlertDeliveryChannelJobV1(channelJob);
      await this.queue.add(STRATEGY_ALERT_DELIVERY_CHANNEL_JOB, accepted, {
        ...STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
        jobId: alertDeliveryChannelJobId(accepted),
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
