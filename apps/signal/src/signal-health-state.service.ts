import { Injectable } from '@nestjs/common';
import {
  resolveRealtimeStrategyMode,
  type RealtimeStrategyMode,
} from '@app/config';
import type { SignalHealthVo } from './signal-health.vo';
import { SignalRuntimeObservabilityService } from './signal-runtime-observability.service';

@Injectable()
export class SignalHealthStateService {
  constructor(
    private readonly runtime = new SignalRuntimeObservabilityService(),
  ) {}
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
  private marketData: SignalHealthVo['marketData'] = {
    state: this.realtimeMode === 'off' ? 'off' : 'ready',
    lastTriggerTime: null,
    lastAcceptedAt: null,
    windowGroupCount: 0,
    rawBarCount: 0,
    derivedBarCount: 0,
    lastFailureCode: null,
  };
  private queue: SignalHealthVo['queue'] = {
    state: this.realtimeMode === 'off' ? 'off' : 'ready',
    workerRunning: false,
    concurrency: 1,
    activeCount: 0,
    processedCount: 0,
    failedCount: 0,
    lastProcessedAt: null,
    lastOutcome: null,
    lastFailureCode: null,
  };
  private evaluation: SignalHealthVo['evaluation'] = {
    state: this.realtimeMode === 'off' ? 'off' : 'idle',
    lastEvaluatedAt: null,
    lastOutcome: null,
    lastPersistenceOutcome: null,
    activeEpisodeCount: 0,
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

  recordWorkerRunning(running: boolean): void {
    this.queue = { ...this.queue, workerRunning: running };
  }

  recordJobStarted(): void {
    this.queue = {
      ...this.queue,
      state: 'ready',
      activeCount: this.queue.activeCount + 1,
    };
    this.evaluation = { ...this.evaluation, state: 'running' };
  }

  recordJobSucceeded(input: {
    acceptedAt: string;
    outcome: Exclude<SignalHealthVo['queue']['lastOutcome'], 'failed' | null>;
    acceptedTriggerTime: string | null;
    evaluated: boolean;
    windowGroupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    activeEpisodeCount: number;
    evaluationOutcome: Exclude<
      SignalHealthVo['evaluation']['lastOutcome'],
      'failed'
    >;
    persistenceOutcome: SignalHealthVo['evaluation']['lastPersistenceOutcome'];
  }): void {
    this.queue = {
      ...this.queue,
      activeCount: Math.max(0, this.queue.activeCount - 1),
      processedCount: this.queue.processedCount + 1,
      lastProcessedAt: input.acceptedAt,
      lastOutcome: input.outcome,
      lastFailureCode: null,
    };
    if (input.acceptedTriggerTime !== null) {
      this.marketData = {
        ...this.marketData,
        state: 'ready',
        lastTriggerTime: input.acceptedTriggerTime,
        lastAcceptedAt: input.acceptedAt,
        windowGroupCount: input.windowGroupCount,
        rawBarCount: input.rawBarCount,
        derivedBarCount: input.derivedBarCount,
        lastFailureCode: null,
      };
    }
    this.evaluation = {
      ...this.evaluation,
      state: 'idle',
      ...(input.evaluated
        ? {
            lastEvaluatedAt: input.acceptedAt,
            lastOutcome: input.evaluationOutcome,
            lastPersistenceOutcome: input.persistenceOutcome,
          }
        : {}),
      activeEpisodeCount: input.activeEpisodeCount,
      lastFailureCode: null,
    };
  }

  recordJobFailed(input: {
    failureCode: string;
    failedAt: string;
    acceptedTriggerTime: string | null;
    evaluationStarted: boolean;
    windowGroupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    activeEpisodeCount: number;
    persistenceOutcome: SignalHealthVo['evaluation']['lastPersistenceOutcome'];
  }): void {
    this.queue = {
      ...this.queue,
      state: 'error',
      activeCount: Math.max(0, this.queue.activeCount - 1),
      processedCount: this.queue.processedCount + 1,
      failedCount: this.queue.failedCount + 1,
      lastProcessedAt: input.failedAt,
      lastOutcome: 'failed',
      lastFailureCode: input.failureCode,
    };
    if (input.acceptedTriggerTime !== null) {
      this.marketData = {
        ...this.marketData,
        lastTriggerTime: input.acceptedTriggerTime,
        lastAcceptedAt: input.failedAt,
        windowGroupCount: input.windowGroupCount,
        rawBarCount: input.rawBarCount,
        derivedBarCount: input.derivedBarCount,
      };
    }
    this.evaluation = input.evaluationStarted
      ? {
          ...this.evaluation,
          state: 'error',
          lastEvaluatedAt: input.failedAt,
          lastOutcome: 'failed',
          lastPersistenceOutcome: input.persistenceOutcome,
          activeEpisodeCount: input.activeEpisodeCount,
          lastFailureCode: input.failureCode,
        }
      : { ...this.evaluation, state: 'idle' };
  }

  snapshot(): SignalHealthVo {
    return {
      status: 'ok',
      instance: 'signal',
      realtimeMode: this.realtimeMode,
      registry: { ...this.registry },
      marketData: { ...this.marketData },
      queue: { ...this.queue },
      evaluation: { ...this.evaluation },
      runtime: this.runtime.snapshot(),
    };
  }
}
