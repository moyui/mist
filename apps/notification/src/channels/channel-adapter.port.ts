import { NotificationChannel } from '@app/shared-data';
import type { NotificationEnvelope } from '../delivery/notification-envelope';

/**
 * Channel adapter contract (deliver-strategy-notifications). Each adapter sends a
 * channel-neutral envelope to one provider protocol/SDK and returns a bounded
 * result. Adapters are direct (not via AstrBot/mist-skills) and must redact
 * credentials from logs.
 */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');

export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(envelope: NotificationEnvelope): Promise<ChannelSendResult>;
}

export interface ChannelSendResult {
  /** sent = delivered; transient_failure = retry (BullMQ); permanent_failure = dead-letter now. */
  readonly status: 'sent' | 'transient_failure' | 'permanent_failure';
  readonly providerMessageId?: string;
  readonly error?: string;
}
