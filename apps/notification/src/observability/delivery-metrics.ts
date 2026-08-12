import { metrics } from '@opentelemetry/api';
import type { NotificationDeliveryCounters } from '../delivery/notification-delivery-counters';

let registered = false;

/**
 * Registers OTel observable gauges for notification delivery outcomes. Pull-model:
 * gauges read the process-local counters (no business-logic side effects). Meter is
 * obtained from the global MeterProvider installed by the
 * `@opentelemetry/auto-instrumentations-node/register` preload (compose command).
 *
 * Queue depth / latency are intentionally NOT covered here (they require async
 * BullMQ getJobCounts polling); this covers the spec's per-channel result +
 * dead-letter observability. Idempotent (single registration per process).
 */
export function registerDeliveryMetrics(
  counters: NotificationDeliveryCounters,
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

  registered = true;
}
