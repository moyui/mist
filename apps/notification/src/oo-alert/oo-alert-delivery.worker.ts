import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type {
  ChannelAdapter,
  ChannelMessage,
} from '../channels/channel-adapter.port';
import { QqChannelAdapter } from '../channels/qq.channel-adapter';
import { buildInfraEnvelope } from './infra-alert.envelope';
import { OoAlertDeliveryCounters } from './oo-alert-delivery-counters';
import {
  OO_ALERT_BULLMQ_PREFIX,
  OO_ALERT_FEISHU_ADAPTER,
  OO_ALERT_JOB_TIMEOUT_MS,
  OO_ALERT_QUEUE_NAME,
  OO_ALERT_WECHAT_ADAPTER,
  OO_ALERT_WORKER_CONCURRENCY,
  type OoAlertJobV1,
} from './oo-alert.constants';

/**
 * Consumes oo-alert-delivery jobs: builds the channel-neutral message and
 * fans out to the dedicated WeCom/Feishu adapters (own bots) plus the shared
 * QQ adapter when NOTIFICATION_CHANNELS includes qq. Transient failures throw
 * so BullMQ retries (attempts 3); permanent failures are logged and counted.
 * Each channel is isolated — a failure on one does not block the others.
 */
@Processor(OO_ALERT_QUEUE_NAME, {
  concurrency: OO_ALERT_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: OO_ALERT_BULLMQ_PREFIX,
})
export class OoAlertDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(OoAlertDeliveryWorker.name);
  private readonly qqEnabled: boolean;
  private readonly feishuConfigured: boolean;

  constructor(
    configService: ConfigService,
    @Inject(OO_ALERT_WECHAT_ADAPTER) private readonly wecom: ChannelAdapter,
    @Inject(OO_ALERT_FEISHU_ADAPTER) private readonly feishu: ChannelAdapter,
    private readonly qq: QqChannelAdapter,
    private readonly counters: OoAlertDeliveryCounters,
  ) {
    super();
    const channels = new Set(
      (configService.get<string>('NOTIFICATION_CHANNELS') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    this.qqEnabled = channels.has('qq');
    // Feishu OO is a dedicated bot (like WeCom); WeCom is always attempted,
    // but an unconfigured Feishu should not incur a network-less adapter round-trip per job.
    this.feishuConfigured = Boolean(
      (
        configService.get<string>('OO_ALERT_FEISHU_WEBHOOK') ??
        configService.get<string>('NOTIFICATION_FEISHU_WEBHOOK') ??
        ''
      ).trim(),
    );
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
    if (this.feishuConfigured) {
      await this.sendChannel(this.feishu, envelope);
    }
    if (this.qqEnabled) {
      await this.sendChannel(this.qq, envelope);
    }
  }

  private async sendChannel(
    adapter: ChannelAdapter,
    envelope: ChannelMessage,
  ): Promise<void> {
    const channel = channelLabel(adapter.channel);
    try {
      const result = await adapter.send(envelope);
      if (result.status === 'sent') {
        this.counters.recordSent(channel);
        return;
      }
      if (result.status === 'permanent_failure') {
        // Feishu unconfigured is the normal case when no webhook is set;
        // skip metric/log noise, but keep failure signal for actually
        // configured but invalid webhooks (e.g. Feishu 19024).
        const isFeishuMissingWebhook =
          channel === 'feishu' && result.errorCode === 'FEISHU_WEBHOOK_MISSING';
        if (!isFeishuMissingWebhook) {
          this.counters.recordFailure(channel);
          this.logger.error(
            `oo alert send failed channel=${channel} permanent error=${result.error ?? '-'}`,
          );
        }
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

/** Metric label for a channel enum value (naming parity with the strategy
 *  side's explicit toNotificationChannel bridge). */
function channelLabel(channel: ChannelAdapter['channel']): string {
  return channel;
}
