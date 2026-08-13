import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type {
  ChannelAdapter,
  ChannelMessage,
} from '../channels/channel-adapter.port';
import { QqChannelAdapter } from '../channels/qq.channel-adapter';
import { NotificationDeliveryCounters } from '../delivery/notification-delivery-counters';
import { buildInfraEnvelope } from './infra-alert.envelope';
import {
  OO_ALERT_BULLMQ_PREFIX,
  OO_ALERT_JOB_TIMEOUT_MS,
  OO_ALERT_QUEUE_NAME,
  OO_ALERT_WECHAT_ADAPTER,
  OO_ALERT_WORKER_CONCURRENCY,
  type OoAlertJobV1,
} from './oo-alert.constants';

/**
 * Consumes oo-alert-delivery jobs: builds the channel-neutral message and
 * fans out to the dedicated WeCom adapter (own bot) plus the shared QQ adapter
 * when NOTIFICATION_CHANNELS includes qq. Transient failures throw so BullMQ
 * retries (attempts 3); permanent failures are logged and counted.
 */
@Processor(OO_ALERT_QUEUE_NAME, {
  concurrency: OO_ALERT_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: OO_ALERT_BULLMQ_PREFIX,
})
export class OoAlertDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(OoAlertDeliveryWorker.name);
  private readonly qqEnabled: boolean;

  constructor(
    config: ConfigService,
    @Inject(OO_ALERT_WECHAT_ADAPTER) private readonly wecom: ChannelAdapter,
    private readonly qq: QqChannelAdapter,
    private readonly counters: NotificationDeliveryCounters,
  ) {
    super();
    const channels = new Set(
      (config.get<string>('NOTIFICATION_CHANNELS') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    this.qqEnabled = channels.has('qq');
  }

  async process(job: Job<OoAlertJobV1, void, string>): Promise<void> {
    const envelope = buildInfraEnvelope(job.data);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.dispatch(envelope),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `oo alert job ${job.data.alertName} exceeded ${OO_ALERT_JOB_TIMEOUT_MS}ms deadline`,
                ),
              ),
            OO_ALERT_JOB_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async dispatch(envelope: ChannelMessage): Promise<void> {
    await this.sendChannel(this.wecom, envelope);
    if (this.qqEnabled) {
      await this.sendChannel(this.qq, envelope);
    }
  }

  private async sendChannel(
    adapter: ChannelAdapter,
    envelope: ChannelMessage,
  ): Promise<void> {
    const channel = String(adapter.channel);
    try {
      const result = await adapter.send(envelope);
      if (result.status === 'sent') {
        this.counters.recordSent(channel);
        return;
      }
      if (result.status === 'permanent_failure') {
        this.counters.recordFailure(channel);
        this.logger.error(
          `oo alert send failed channel=${channel} permanent error=${result.error ?? '-'}`,
        );
        return;
      }
      // transient_failure → throw so BullMQ retries
      throw new Error(result.error ?? 'transient failure');
    } catch (error) {
      this.logger.error(
        `oo alert send failed channel=${channel} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
