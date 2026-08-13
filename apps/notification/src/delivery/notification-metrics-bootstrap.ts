import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  registerDeliveryMetrics,
  registerSweepMetrics,
  type QueueDepthSnapshot,
} from '../observability/delivery-metrics';
import { OoAlertQueueService } from '../oo-alert/oo-alert-queue.service';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';
import { NotificationDeliveryCounters } from './notification-delivery-counters';
import { PendingAlertDeliverySweepService } from './pending-alert-delivery-sweep.service';

const QUEUE_SAMPLE_INTERVAL_MS = 15_000;

/**
 * Triggers OTel metric registration on module init + samples BullMQ queue depth
 * for BOTH alert queues (strategy + oo-alert) on a fixed interval, caching it
 * for the sync observable gauge. Must run after the counters + queue services
 * are instantiated.
 */
@Injectable()
export class NotificationMetricsBootstrap
  implements OnModuleInit, OnModuleDestroy
{
  private queueDepth: QueueDepthSnapshot = {
    strategy: { waiting: 0, active: 0, delayed: 0 },
    ooAlert: { waiting: 0, active: 0, delayed: 0 },
  };
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly counters: NotificationDeliveryCounters,
    private readonly queueService: AlertDeliveryQueueService,
    private readonly ooAlertQueueService: OoAlertQueueService,
    private readonly sweepService: PendingAlertDeliverySweepService,
  ) {}

  onModuleInit(): void {
    registerDeliveryMetrics(this.counters, () => this.queueDepth);
    registerSweepMetrics(() => this.sweepService.getRecoveredTotal());
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
      const [strategy, ooAlert] = await Promise.all([
        this.queueService.snapshotCounts(),
        this.ooAlertQueueService.snapshotCounts(),
      ]);
      this.queueDepth = { strategy, ooAlert };
    } catch {
      // Redis/queue unavailable — keep the last cached value.
    }
  }
}
