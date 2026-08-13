import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { parseRedisConnectionUrl } from '@app/realtime';
import {
  OO_ALERT_BULLMQ_PREFIX,
  OO_ALERT_JOB,
  OO_ALERT_QUEUE_NAME,
  type OoAlertJobV1,
} from './oo-alert.constants';

/**
 * Producer-side BullMQ queue for OO health alerts. Dedicated queue
 * (`oo-alert-delivery`) buffers bursts so the channel adapters are not hit
 * concurrently. jobId dedupes the same alert within one minute window —
 * a persistent anomaly does not spam WeCom/QQ.
 */
@Injectable()
export class OoAlertQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    this.queue = new Queue(OO_ALERT_QUEUE_NAME, {
      connection: {
        ...parseRedisConnectionUrl(
          config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
        ),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        commandTimeout: 3_000,
      },
      prefix: OO_ALERT_BULLMQ_PREFIX,
    });
  }

  async enqueue(job: OoAlertJobV1): Promise<void> {
    await this.queue.add(OO_ALERT_JOB, job, {
      jobId: `${job.alertName}:${windowStartMs(job.ts)}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.queue.close();
  }
}

function windowStartMs(ts: string): number {
  return Math.floor(Date.parse(ts) / 60_000) * 60_000;
}
