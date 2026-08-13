import { Injectable } from '@nestjs/common';

export interface OoAlertCountersSnapshot {
  readonly sent: Readonly<Record<string, number>>;
  readonly failed: Readonly<Record<string, number>>;
}

/**
 * Process-local counters for OO health-alert delivery
 * (remediate-alert-delivery-integrity M1). Separate from
 * NotificationDeliveryCounters so infra-alert outcomes never leak into the
 * strategy-only mist_notification_* gauges. Counters are per-process (not
 * durable); they reset on restart — sufficient for live delivery-rate
 * observation, not for accounting.
 */
@Injectable()
export class OoAlertDeliveryCounters {
  private sent: Record<string, number> = {};
  private failed: Record<string, number> = {};

  recordSent(channel: string): void {
    this.sent[channel] = (this.sent[channel] ?? 0) + 1;
  }

  recordFailure(channel: string): void {
    this.failed[channel] = (this.failed[channel] ?? 0) + 1;
  }

  snapshot(): OoAlertCountersSnapshot {
    return {
      sent: { ...this.sent },
      failed: { ...this.failed },
    };
  }
}
