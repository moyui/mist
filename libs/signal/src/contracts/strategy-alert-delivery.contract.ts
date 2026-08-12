import { NotificationChannel } from '@app/shared-data';

/**
 * BullMQ contract for proactive strategy alert delivery (deliver-strategy-notifications).
 * Producer (apps/signal) enqueues a fanout job per committed AlertEvent; the worker
 * (apps/notification) fans out to one channel job per configured channel, each retried
 * independently via BullMQ attempts/backoff.
 */
export const STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX = 'mist-bullmq';
export const STRATEGY_ALERT_DELIVERY_QUEUE_NAME = 'strategy-alert-delivery';
export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB = 'deliver.fanout';
export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB = 'deliver.channel';
export const STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY = 4;

export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS = Object.freeze({
  attempts: 1,
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 604_800 }),
});

export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: Object.freeze({ type: 'exponential' as const, delay: 5_000 }),
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 604_800 }),
});

export interface AlertDeliveryFanoutJobV1 {
  readonly contractVersion: 1;
  readonly alertEventId: number;
}

export interface AlertDeliveryChannelJobV1 {
  readonly contractVersion: 1;
  readonly alertEventId: number;
  readonly channel: NotificationChannel;
}

const FANOUT_KEYS = Object.freeze(['contractVersion', 'alertEventId']);
const CHANNEL_KEYS = Object.freeze([
  'contractVersion',
  'alertEventId',
  'channel',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}

function isPositiveSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function decodeAlertDeliveryFanoutJobV1(
  input: unknown,
): AlertDeliveryFanoutJobV1 {
  if (!isRecord(input) || !hasExactKeys(input, FANOUT_KEYS)) {
    throw new TypeError(
      'deliver.fanout data must contain exactly the V1 fields',
    );
  }
  if (input.contractVersion !== 1) {
    throw new TypeError('deliver.fanout contractVersion must be 1');
  }
  if (!isPositiveSafeInt(input.alertEventId)) {
    throw new TypeError(
      'deliver.fanout alertEventId must be a positive safe integer',
    );
  }
  return Object.freeze({
    contractVersion: 1,
    alertEventId: input.alertEventId,
  });
}

export function decodeAlertDeliveryChannelJobV1(
  input: unknown,
): AlertDeliveryChannelJobV1 {
  if (!isRecord(input) || !hasExactKeys(input, CHANNEL_KEYS)) {
    throw new TypeError(
      'deliver.channel data must contain exactly the V1 fields',
    );
  }
  if (input.contractVersion !== 1) {
    throw new TypeError('deliver.channel contractVersion must be 1');
  }
  if (!isPositiveSafeInt(input.alertEventId)) {
    throw new TypeError(
      'deliver.channel alertEventId must be a positive safe integer',
    );
  }
  if (
    input.channel !== NotificationChannel.QQ &&
    input.channel !== NotificationChannel.WECHAT
  ) {
    throw new TypeError('deliver.channel channel must be qq or wechat');
  }
  return Object.freeze({
    contractVersion: 1,
    alertEventId: input.alertEventId,
    channel: input.channel,
  });
}

export function alertDeliveryFanoutJobId(
  job: AlertDeliveryFanoutJobV1,
): string {
  const accepted = decodeAlertDeliveryFanoutJobV1(job);
  return `deliver-fanout-v1-${accepted.alertEventId}`;
}

export function alertDeliveryChannelJobId(
  job: AlertDeliveryChannelJobV1,
): string {
  const accepted = decodeAlertDeliveryChannelJobV1(job);
  return `deliver-channel-v1-${accepted.alertEventId}-${accepted.channel}`;
}
