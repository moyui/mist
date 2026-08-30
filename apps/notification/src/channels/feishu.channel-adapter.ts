import { createHmac } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@app/shared-data';
import type {
  ChannelAdapter,
  ChannelMessage,
  ChannelSendResult,
} from './channel-adapter.port';

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

interface FeishuWebhookResponse {
  StatusCode?: number;
  code?: number;
  StatusMessage?: string;
  msg?: string;
}

// Feishu webhook codes that indicate a permanent config/auth error (do not retry).
// 19024 = invalid webhook token, 19021 = invalid timestamp, 230002 = signature mismatch.
// Others (e.g. 19030 rate-limit) are transient (BullMQ retries -> dead-letter).
const PERMANENT_CODES = new Set<number>([19021, 19024, 230002]);

/**
 * Feishu (group custom-bot) channel adapter via the official webhook.
 * POST <webhook> { msg_type:'text', content:{ text } } plus optional
 * timestamp/sign when a secret is configured. StatusCode/code 0 = sent;
 * permanent auth errors => permanent_failure; others/timeouts => transient.
 * Webhook URL/secret never logged.
 */
export const FEISHU_CLOCK = Symbol('FEISHU_CLOCK');

export interface FeishuClock {
  nowSeconds(): number;
}

@Injectable()
export class FeishuChannelAdapter implements ChannelAdapter {
  readonly channel = NotificationChannel.FEISHU;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly webhookEnvName = 'NOTIFICATION_FEISHU_WEBHOOK',
    @Optional() private readonly secretEnvName = 'NOTIFICATION_FEISHU_SECRET',
    @Optional()
    @Inject(FEISHU_CLOCK)
    private readonly clock: FeishuClock | null = null,
  ) {}

  async send(message: ChannelMessage): Promise<ChannelSendResult> {
    const webhook = (this.config.get<string>(this.webhookEnvName) ?? '').trim();
    const secret = (this.config.get<string>(this.secretEnvName) ?? '').trim();
    const timeoutMs =
      this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS') ??
      DEFAULT_HTTP_TIMEOUT_MS;

    if (!webhook) {
      return {
        status: 'permanent_failure',
        error: `Feishu webhook not configured (${this.webhookEnvName} missing)`,
        errorCode: 'FEISHU_WEBHOOK_MISSING',
      };
    }

    const payload: Record<string, unknown> = {
      msg_type: 'text',
      content: { text: message.text },
    };
    if (secret) {
      const timestamp = String(
        this.clock?.nowSeconds() ?? Math.floor(Date.now() / 1000),
      );
      const sign = createHmac('sha256', secret)
        .update(`${timestamp}\n${secret}`)
        .digest('base64');
      payload.timestamp = timestamp;
      payload.sign = sign;
    }

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json()) as FeishuWebhookResponse;
      const code =
        typeof json.StatusCode === 'number'
          ? json.StatusCode
          : typeof json.code === 'number'
            ? json.code
            : undefined;
      if (code === 0) {
        return { status: 'sent' };
      }
      const permanent = code !== undefined && PERMANENT_CODES.has(code);
      return {
        status: permanent ? 'permanent_failure' : 'transient_failure',
        error: `Feishu code=${code ?? '?'} msg=${json.msg ?? json.StatusMessage ?? ''}`,
      };
    } catch (error) {
      return {
        status: 'transient_failure',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
