import { metrics } from '@opentelemetry/api';
import type { NotificationDeliveryCounters } from '../delivery/notification-delivery-counters';

let registered = false;
let sweepRegistered = false;

export interface QueueDepthSnapshot {
  readonly strategy: Readonly<{
    waiting: number;
    active: number;
    delayed: number;
  }>;
  readonly ooAlert: Readonly<{
    waiting: number;
    active: number;
    delayed: number;
  }>;
}

/**
 * Registers OTel observable gauges for notification delivery outcomes + queue
 * depth. Counters are pull-model (process-local); queue depth is sampled async by
 * the caller (NotificationMetricsBootstrap polls BullMQ getJobCounts every ~15s and
 * caches; the gauge reads the cache). Meter comes from the global MeterProvider
 * installed by the @opentelemetry/auto-instrumentations-node/register preload.
 * Idempotent (single registration per process).
 */
export function registerDeliveryMetrics(
  counters: NotificationDeliveryCounters,
  queueDepth: () => QueueDepthSnapshot,
): void {
  if (registered) return;
  const meter = metrics.getMeter('mist-notification', '0.1.0');

  const addChannelGauge = (
    name: string,
    description: string,
    pick: (
      s: ReturnType<NotificationDeliveryCounters['snapshot']>,
    ) => Readonly<Record<string, number>>,
  ): void => {
    meter.createObservableGauge(name, { description }).addCallback((result) => {
      for (const [channel, value] of Object.entries(
        pick(counters.snapshot()),
      )) {
        result.observe(value, { channel });
      }
    });
  };

  addChannelGauge(
    'mist_notification_delivered_total',
    'Delivered strategy alert notifications (process-local)',
    (s) => s.delivered,
  );
  addChannelGauge(
    'mist_notification_failed_total',
    'Failed delivery attempts (process-local)',
    (s) => s.failed,
  );
  addChannelGauge(
    'mist_notification_dead_letter_total',
    'Dead-lettered deliveries (process-local)',
    (s) => s.deadLettered,
  );
  addChannelGauge(
    'mist_notification_attempt_total',
    'Total delivery attempts (process-local)',
    (s) => s.attempts,
  );

  const queues: ReadonlyArray<{
    key: keyof QueueDepthSnapshot;
    label: 'strategy' | 'oo_alert';
  }> = [
    { key: 'strategy', label: 'strategy' },
    { key: 'ooAlert', label: 'oo_alert' },
  ];
  meter
    .createObservableGauge('mist_notification_queue_depth', {
      description:
        'Alert delivery BullMQ queue depth (waiting/active/delayed) by queue',
    })
    .addCallback((result) => {
      const snap = queueDepth();
      for (const { key, label } of queues) {
        const depth = snap[key];
        result.observe(depth.waiting, { state: 'waiting', queue: label });
        result.observe(depth.active, { state: 'active', queue: label });
        result.observe(depth.delayed, { state: 'delayed', queue: label });
      }
    });

  registered = true;
}

/** Registers the sweep-recovery gauge (M2); idempotent, one registration per process. */
export function registerSweepMetrics(recoveredTotal: () => number): void {
  if (sweepRegistered) return;
  const meter = metrics.getMeter('mist-notification', '0.1.0');
  meter
    .createObservableGauge('mist_notification_sweep_recovered_total', {
      description:
        'Stranded PENDING events re-enqueued by the delivery sweep (process-local)',
    })
    .addCallback((result) => {
      result.observe(recoveredTotal());
    });
  sweepRegistered = true;
}
