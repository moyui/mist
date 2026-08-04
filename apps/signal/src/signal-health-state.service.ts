import { Injectable } from '@nestjs/common';
import {
  resolveRealtimeStrategyMode,
  type RealtimeStrategyMode,
} from '@app/config';
import type { SignalHealthVo } from './signal-health.vo';

@Injectable()
export class SignalHealthStateService {
  private readonly realtimeMode: RealtimeStrategyMode =
    resolveRealtimeStrategyMode(process.env.REALTIME_STRATEGY_MODE);
  private registry: SignalHealthVo['registry'] = {
    ready: false,
    generation: 0,
    definitionCount: 0,
    executionPlanCount: 0,
    lastRefreshAt: null,
    lastRefreshOutcome: null,
    lastFailureCode: null,
  };

  recordRegistrySuccess(
    generation: number,
    definitionCount: number,
    executionPlanCount: number,
    refreshedAt: string,
  ): void {
    this.registry = {
      ready: true,
      generation,
      definitionCount,
      executionPlanCount,
      lastRefreshAt: refreshedAt,
      lastRefreshOutcome: 'success',
      lastFailureCode: null,
    };
  }

  recordRegistryFailure(failureCode: string, failedAt: string): void {
    this.registry = {
      ...this.registry,
      lastRefreshAt: failedAt,
      lastRefreshOutcome: 'failed',
      lastFailureCode: failureCode,
    };
  }

  snapshot(): SignalHealthVo {
    const off = this.realtimeMode === 'off';
    return {
      status: 'ok',
      instance: 'signal',
      realtimeMode: this.realtimeMode,
      registry: { ...this.registry },
      marketData: {
        state: off ? 'off' : 'ready',
        lastTriggerTime: null,
        lastAcceptedAt: null,
        windowGroupCount: 0,
        rawBarCount: 0,
        derivedBarCount: 0,
        lastFailureCode: null,
      },
      queue: {
        state: off ? 'off' : 'ready',
        workerRunning: !off,
        concurrency: 1,
        activeCount: 0,
        processedCount: 0,
        failedCount: 0,
        lastProcessedAt: null,
        lastOutcome: null,
        lastFailureCode: null,
      },
      evaluation: {
        state: off ? 'off' : 'idle',
        lastEvaluatedAt: null,
        lastOutcome: null,
        activeEpisodeCount: 0,
        lastFailureCode: null,
      },
    };
  }
}
