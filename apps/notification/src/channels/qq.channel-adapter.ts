import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@app/shared-data';
import type {
  ChannelAdapter,
  ChannelMessage,
  ChannelSendResult,
} from './channel-adapter.port';

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

interface OneBotSendMsgResponse {
  status?: string;
  retcode?: number;
  msg?: string;
  data?: { message_id?: number };
}

/**
 * QQ channel adapter via NapCat OneBot 11 HTTP API (POST {base}/send_msg).
 * Credentials come from env only (NOTIFICATION_QQ_*); logs never include the
 * access token. Unconfigured => permanent_failure; transport/protocol errors
 * => transient_failure (BullMQ retries, then dead-letter).
 */
@Injectable()
export class QqChannelAdapter implements ChannelAdapter {
  readonly channel = NotificationChannel.QQ;

  constructor(private readonly config: ConfigService) {}

  async send(message: ChannelMessage): Promise<ChannelSendResult> {
    const baseUrl = (
      this.config.get<string>('NOTIFICATION_QQ_BASE_URL') ?? ''
    ).trim();
    const target = (
      this.config.get<string>('NOTIFICATION_QQ_TARGET') ?? ''
    ).trim();
    const messageType =
      this.config.get<string>('NOTIFICATION_QQ_MESSAGE_TYPE') ?? 'group';
    const token = this.config.get<string>('NOTIFICATION_QQ_ACCESS_TOKEN') ?? '';
    const timeoutMs =
      this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS') ??
      DEFAULT_HTTP_TIMEOUT_MS;

    if (!baseUrl || !target) {
      return {
        status: 'permanent_failure',
        error:
          'QQ adapter not configured (NOTIFICATION_QQ_BASE_URL/TARGET missing)',
        errorCode: 'QQ_NOT_CONFIGURED',
      };
    }

    const targetField = messageType === 'private' ? 'user_id' : 'group_id';
    const body = JSON.stringify({
      message_type: messageType,
      [targetField]: Number(target),
      message: [{ type: 'text', data: { text: message.text } }],
    });
    // NapCat OneBot 11 HTTP accepts access_token as a query param (the form its
    // default HTTP server reliably checks). Avoids header/auth-config ambiguity.
    const endpoint = token
      ? `${baseUrl.replace(/\/$/, '')}/send_msg?access_token=${encodeURIComponent(token)}`
      : `${baseUrl.replace(/\/$/, '')}/send_msg`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = (await res.json()) as OneBotSendMsgResponse;
      if (json.status === 'ok' || json.retcode === 0) {
        const messageId = json.data?.message_id;
        return {
          status: 'sent',
          providerMessageId:
            messageId !== undefined && messageId !== null
              ? String(messageId)
              : undefined,
        };
      }
      return {
        status: 'transient_failure',
        error: `QQ OneBot status=${json.status ?? '?'} retcode=${json.retcode ?? '?'} msg=${json.msg ?? ''}`,
      };
    } catch (error) {
      return {
        status: 'transient_failure',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
