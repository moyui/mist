import type { RealtimeStrategyMode } from '@app/config';

export interface SignalHealthVo {
  status: 'ok';
  instance: 'signal';
  realtimeMode: RealtimeStrategyMode;
  registry: {
    ready: boolean;
    generation: number;
    definitionCount: number;
    executionPlanCount: number;
    lastRefreshAt: string | null;
    lastRefreshOutcome: 'success' | 'failed' | null;
    lastFailureCode: string | null;
  };
  marketData: {
    state: 'off' | 'ready' | 'error';
    lastTriggerTime: string | null;
    lastAcceptedAt: string | null;
    windowGroupCount: number;
    rawBarCount: number;
    derivedBarCount: number;
    lastFailureCode: string | null;
  };
  queue: {
    state: 'off' | 'ready' | 'reconnecting' | 'error';
    workerRunning: boolean;
    concurrency: 1;
    activeCount: number;
    processedCount: number;
    failedCount: number;
    lastProcessedAt: string | null;
    lastOutcome:
      | 'completed'
      | 'failed'
      | 'expired_trading_day'
      | 'out_of_order_trigger_discarded'
      | null;
    lastFailureCode: string | null;
  };
  evaluation: {
    state: 'off' | 'idle' | 'running' | 'error';
    lastEvaluatedAt: string | null;
    lastOutcome:
      | 'evaluated_matched'
      | 'evaluated_not_matched'
      | 'unavailable'
      | 'failed'
      | null;
    activeEpisodeCount: number;
    lastFailureCode: string | null;
  };
}
