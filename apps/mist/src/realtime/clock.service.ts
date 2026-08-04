import { Injectable } from '@nestjs/common';

/**
 * Injectable wall-clock service abstraction.
 *
 * B1 design mandates a single replaceable `Clock` so that candle bucketing,
 * finalizer cutoff, relative TTL and due-scanner all derive time from one
 * source. Tests inject a fake; production uses {@link Date.now}.
 *
 * Provider `eventTime` and datasource `capturedAt` are NOT read through this
 * clock — those are transport/business timestamps. This clock only produces
 * backend-internal moments (`acceptedAt`, `closedAt`, due scores, TTL
 * durations).
 */
@Injectable()
export class Clock {
  /** Current wall-clock time as epoch milliseconds. */
  now(): number {
    return Date.now();
  }

  /** Current wall-clock time as a JS Date. Convenience for `new Date(now())`. */
  nowDate(): Date {
    return new Date(this.now());
  }
}
