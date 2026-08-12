import { Injectable } from '@nestjs/common';

export interface DeliveryCountersSnapshot {
  readonly delivered: Readonly<Record<string, number>>;
  readonly failed: Readonly<Record<string, number>>;
  readonly deadLettered: Readonly<Record<string, number>>;
  readonly attempts: Readonly<Record<string, number>>;
}

/**
 * Process-local delivery counters, read by OTel observable gauges. Low-cardinality
 * by channel (qq/wechat). Counters are per-process (not durable); they reset on
 * restart — sufficient for live delivery-rate observation, not for accounting.
 */
@Injectable()
export class NotificationDeliveryCounters {
  private delivered: Record<string, number> = {};
  private failed: Record<string, number> = {};
  private deadLettered: Record<string, number> = {};
  private attempts: Record<string, number> = {};

  recordAttempt(channel: string): void {
    this.attempts[channel] = (this.attempts[channel] ?? 0) + 1;
  }

  recordSent(channel: string): void {
    this.delivered[channel] = (this.delivered[channel] ?? 0) + 1;
  }

  recordFailure(channel: string): void {
    this.failed[channel] = (this.failed[channel] ?? 0) + 1;
  }

  recordDeadLetter(channel: string): void {
    this.deadLettered[channel] = (this.deadLettered[channel] ?? 0) + 1;
  }

  snapshot(): DeliveryCountersSnapshot {
    return {
      delivered: { ...this.delivered },
      failed: { ...this.failed },
      deadLettered: { ...this.deadLettered },
      attempts: { ...this.attempts },
    };
  }
}
