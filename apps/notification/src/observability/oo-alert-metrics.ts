import { metrics } from '@opentelemetry/api';
import type { OoAlertDeliveryCounters } from '../oo-alert/oo-alert-delivery-counters';

let registered = false;

/**
 * Registers the OTel observable gauge for OO health-alert delivery outcomes
 * (remediate-alert-delivery-integrity M1). Counters are pull-model
 * (process-local); meter comes from the global MeterProvider installed by the
 * @opentelemetry/auto-instrumentations-node/register preload. Idempotent
 * (single registration per process). Deliberately separate from
 * registerDeliveryMetrics: mist_oo_alert_total must never mix with the
 * strategy-only mist_notification_* gauges.
 */
export function registerOoAlertMetrics(
  counters: OoAlertDeliveryCounters,
): void {
  if (registered) return;
  const meter = metrics.getMeter('mist-notification-oo-alert', '0.1.0');

  meter
    .createObservableGauge('mist_oo_alert_total', {
      description:
        'OO health-alert deliveries by status (sent/failed) and channel (process-local)',
    })
    .addCallback((result) => {
      const snap = counters.snapshot();
      for (const [channel, value] of Object.entries(snap.sent)) {
        result.observe(value, { status: 'sent', channel });
      }
      for (const [channel, value] of Object.entries(snap.failed)) {
        result.observe(value, { status: 'failed', channel });
      }
    });

  registered = true;
}
