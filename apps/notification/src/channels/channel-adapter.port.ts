import { NotificationChannel } from '@app/shared-data';

/**
 * Channel-neutral message body sent by adapters. Adapters only consume the
 * text; strategy delivery builds it from AlertEvent evidence, infra alerts
 * (OO health alerts) build it from the alert payload.
 */
export interface ChannelMessage {
  readonly text: string;
}

/**
 * Channel adapter contract (deliver-strategy-notifications + OO health alerts).
 * Each adapter sends a channel-neutral message to one provider protocol/SDK and
 * returns a bounded result. Adapters are direct (not via AstrBot/mist-skills)
 * and must redact credentials from logs.
 */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');

export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(message: ChannelMessage): Promise<ChannelSendResult>;
}

/**
 * Stable per-channel error classification for `permanent_failure` outcomes.
 * Adapters SHOULD set this when the failure reason is a known stable branch
 * (e.g. missing env) so callers can gate without substring-matching error text.
 */
export type ChannelErrorCode =
  | 'FEISHU_WEBHOOK_MISSING'
  | 'WECOM_WEBHOOK_MISSING'
  | 'QQ_NOT_CONFIGURED';

export interface ChannelSendResult {
  /** sent = delivered; transient_failure = retry (BullMQ); permanent_failure = dead-letter now. */
  readonly status: 'sent' | 'transient_failure' | 'permanent_failure';
  readonly providerMessageId?: string;
  readonly error?: string;
  /** Stable machine-readable classification for `permanent_failure` (optional). */
  readonly errorCode?: ChannelErrorCode;
}
