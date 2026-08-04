import { Injectable } from '@nestjs/common';
import type { StartupCompensationOutcome } from './realtime-strategy-startup-compensation.service';

export interface RealtimeStrategyHandoffObservation {
  enabled: boolean;
  sharedRedisFailureDomain: true;
  liveEnqueue: {
    successTotal: number;
    failureTotal: number;
    lastOutcome: 'success' | 'failed' | null;
  };
  startupCompensation: {
    outcome: StartupCompensationOutcome;
    submitted: number;
  };
}

/** Process-local handoff evidence; it does not claim queue reconciliation. */
@Injectable()
export class RealtimeStrategyHandoffObservabilityService {
  private liveSuccessTotal = 0;
  private liveFailureTotal = 0;
  private lastLiveOutcome: 'success' | 'failed' | null = null;
  private startupOutcome: StartupCompensationOutcome = 'not_enabled';
  private startupSubmitted = 0;

  recordLiveSuccess(): void {
    this.liveSuccessTotal += 1;
    this.lastLiveOutcome = 'success';
  }

  recordLiveFailure(): void {
    this.liveFailureTotal += 1;
    this.lastLiveOutcome = 'failed';
  }

  recordStartup(outcome: StartupCompensationOutcome, submitted: number): void {
    this.startupOutcome = outcome;
    this.startupSubmitted = submitted;
  }

  snapshot(enabled: boolean): RealtimeStrategyHandoffObservation {
    return {
      enabled,
      sharedRedisFailureDomain: true,
      liveEnqueue: {
        successTotal: this.liveSuccessTotal,
        failureTotal: this.liveFailureTotal,
        lastOutcome: this.lastLiveOutcome,
      },
      startupCompensation: {
        outcome: this.startupOutcome,
        submitted: this.startupSubmitted,
      },
    };
  }
}
