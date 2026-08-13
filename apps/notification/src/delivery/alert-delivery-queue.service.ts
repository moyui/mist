import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { parseRedisConnectionUrl } from '@app/realtime';
import { NotificationChannel } from '@app/shared-data';
import {
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
  alertDeliveryChannelJobId,
  alertDeliveryFanoutJobId,
  decodeAlertDeliveryChannelJobV1,
  decodeAlertDeliveryFanoutJobV1,
} from '@app/signal';

/**
 * Owns the single producer-side BullMQ Queue for strategy-alert-delivery.
 * Consolidates enqueue logic for fanout, channel, and replay so only one Redis
 * producer connection is opened (the worker side runs its own consumer
 * forRootAsync + manualRegistration). Fail-fast connection: enqueue errors
 * surface to callers, which treat them as best-effort.
 */
@Injectable()
export class AlertDeliveryQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.queue = new Queue(STRATEGY_ALERT_DELIVERY_QUEUE_NAME, {
      connection: {
        ...parseRedisConnectionUrl(
          config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
        ),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        commandTimeout: 3_000,
      },
      prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
    });
  }

  /** Enqueue deliver.fanout (deterministic jobId dedupes duplicate enqueues). */
  async enqueueFanout(alertEventId: number): Promise<void> {
    const accepted = decodeAlertDeliveryFanoutJobV1({
      contractVersion: 1,
      alertEventId,
    });
    await this.queue.add(STRATEGY_ALERT_DELIVERY_FANOUT_JOB, accepted, {
      ...STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS,
      jobId: alertDeliveryFanoutJobId(accepted),
    });
  }

  /** Enqueue deliver.channel (deterministic jobId dedupes re-fanout). */
  async enqueueChannel(
    alertEventId: number,
    channel: NotificationChannel,
  ): Promise<void> {
    const accepted = decodeAlertDeliveryChannelJobV1({
      contractVersion: 1,
      alertEventId,
      channel,
    });
    await this.queue.add(STRATEGY_ALERT_DELIVERY_CHANNEL_JOB, accepted, {
      ...STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
      jobId: alertDeliveryChannelJobId(accepted),
    });
  }

  /**
   * Enqueue a fresh deliver.channel for replay. No deterministic jobId => a new
   * job is always created (the prior failed job lingers in BullMQ's failed set
   * until removeOnFail age cleans it; harmless). The caller must first reset the
   * delivery row to PENDING so the worker does not idempotently skip it.
   */
  async enqueueChannelReplay(
    alertEventId: number,
    channel: NotificationChannel,
  ): Promise<void> {
    const accepted = decodeAlertDeliveryChannelJobV1({
      contractVersion: 1,
      alertEventId,
      channel,
    });
    await this.queue.add(
      STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
      accepted,
      STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
    );
  }

  /** BullMQ job counts by state, for the queue-depth metric. */
  async snapshotCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
  }> {
    const c = await this.queue.getJobCounts('waiting', 'active', 'delayed');
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      delayed: c.delayed ?? 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
