import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@app/shared-data';
import type {
  ChannelAdapter,
  ChannelMessage,
  ChannelSendResult,
} from './channel-adapter.port';

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

interface WeComWebhookResponse {
  errcode?: number;
  errmsg?: string;
}

// WeCom webhook errcodes that indicate a permanent config error (do not retry).
// 93000 = invalid webhook, 93001 = webhook disabled. Others (e.g. 45009 rate
// limit, 60020 IP not whitelisted) are treated as transient.
const PERMANENT_ERRCODES = new Set<number>([93000, 93001]);

/**
 * WeChat (WeCom group robot) channel adapter via the official webhook.
 * POST <webhook> { msgtype:'text', text:{ content } }. errcode 0 = sent;
 * anything else (incl. rate-limit 45009) = transient_failure (retried, then
 * dead-lettered). Webhook URL stays in env only; never logged.
 */
@Injectable()
export class WeComChannelAdapter implements ChannelAdapter {
  readonly channel = NotificationChannel.WECHAT;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly webhookEnvName = 'NOTIFICATION_WECHAT_WEBHOOK',
  ) {}

  async send(message: ChannelMessage): Promise<ChannelSendResult> {
    const webhook = (this.config.get<string>(this.webhookEnvName) ?? '').trim();
    const timeoutMs =
      this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS') ??
      DEFAULT_HTTP_TIMEOUT_MS;

    if (!webhook) {
      return {
        status: 'permanent_failure',
        error: `WeCom webhook not configured (${this.webhookEnvName} missing)`,
        errorCode: 'WECOM_WEBHOOK_MISSING',
      };
    }

    const body = JSON.stringify({
      msgtype: 'text',
      text: { content: message.text },
    });

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json()) as WeComWebhookResponse;
      if (json.errcode === 0) {
        return { status: 'sent' };
      }
      const permanent = PERMANENT_ERRCODES.has(json.errcode ?? -1);
      return {
        status: permanent ? 'permanent_failure' : 'transient_failure',
        error: `WeCom errcode=${json.errcode ?? '?'} errmsg=${json.errmsg ?? ''}`,
      };
    } catch (error) {
      return {
        status: 'transient_failure',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
