import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  registerDeliveryMetrics,
  type QueueDepthSnapshot,
} from '../observability/delivery-metrics';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

const QUEUE_SAMPLE_INTERVAL_MS = 15_000;

/**
 * Triggers OTel metric registration on module init + samples BullMQ queue depth
 * (async getJobCounts) on a fixed interval, caching it for the sync observable
 * gauge. Must run after the counters + queue service are instantiated.
 */
@Injectable()
export class NotificationMetricsBootstrap
  implements OnModuleInit, OnModuleDestroy
{
  private queueDepth: QueueDepthSnapshot = {
    waiting: 0,
    active: 0,
    delayed: 0,
  };
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly counters: NotificationDeliveryCounters,
    private readonly queueService: AlertDeliveryQueueService,
  ) {}

  onModuleInit(): void {
    registerDeliveryMetrics(this.counters, () => this.queueDepth);
    void this.sampleQueueDepth();
    this.timer = setInterval(
      () => void this.sampleQueueDepth(),
      QUEUE_SAMPLE_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sampleQueueDepth(): Promise<void> {
    try {
      this.queueDepth = await this.queueService.snapshotCounts();
    } catch {
      // Redis/queue unavailable — keep the last cached value.
    }
  }
}
