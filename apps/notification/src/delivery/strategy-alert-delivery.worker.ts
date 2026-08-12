import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
  STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY,
  decodeAlertDeliveryChannelJobV1,
  decodeAlertDeliveryFanoutJobV1,
  type AlertDeliveryChannelJobV1,
  type AlertDeliveryFanoutJobV1,
} from '@app/signal';
import { AlertChannelDeliveryService } from './alert-channel-delivery.service';
import { AlertFanoutService } from './alert-fanout.service';

type AnyDeliveryJob = AlertDeliveryFanoutJobV1 | AlertDeliveryChannelJobV1;

@Processor(STRATEGY_ALERT_DELIVERY_QUEUE_NAME, {
  concurrency: STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
})
export class StrategyAlertDeliveryWorker extends WorkerHost {
  constructor(
    private readonly fanout: AlertFanoutService,
    private readonly channelDelivery: AlertChannelDeliveryService,
  ) {
    super();
  }

  async process(job: Job<AnyDeliveryJob, void, string>): Promise<void> {
    switch (job.name) {
      case STRATEGY_ALERT_DELIVERY_FANOUT_JOB:
        return await this.fanout.run(decodeAlertDeliveryFanoutJobV1(job.data));
      case STRATEGY_ALERT_DELIVERY_CHANNEL_JOB: {
        const decoded = decodeAlertDeliveryChannelJobV1(job.data);
        const maxAttempts = job.opts.attempts ?? 1;
        return await this.channelDelivery.run(
          decoded,
          job.attemptsMade,
          maxAttempts,
        );
      }
      default:
        throw new Error(
          `Unknown strategy-alert-delivery job name: ${job.name}`,
        );
    }
  }
}
