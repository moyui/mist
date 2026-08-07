import { Injectable } from '@nestjs/common';
import { isMockMode } from '@app/config';

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
 *
 * Mock mode MAY shift the clock forward (`MIST_MOCK_CLOCK_OFFSET_MS`) so the
 * wall-clock-driven stages (due admission, finalization, vwap consistency
 * checks) advance naturally outside trading hours; unset/0 or non-mock keeps
 * real wall-clock time.
 */
@Injectable()
export class Clock {
  private readonly mockOffsetMs = isMockMode()
    ? Number(process.env.MIST_MOCK_CLOCK_OFFSET_MS ?? 0) || 0
    : 0;

  /** Current wall-clock time as epoch milliseconds. */
  now(): number {
    return Date.now() + this.mockOffsetMs;
  }

  /** Current wall-clock time as a JS Date. Convenience for `new Date(now())`. */
  nowDate(): Date {
    return new Date(this.now());
  }
}
