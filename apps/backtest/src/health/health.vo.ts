import type { BaseHealthVo, HealthStatus } from '@app/observability';

export interface BacktestHealthVo extends BaseHealthVo {
  readonly status: HealthStatus;
  readonly service: 'backtest';
  readonly instance: 'backtest';
  readonly timestamp: string;
  readonly backtest: {
    readonly ready: boolean;
    readonly state: 'starting' | 'ready' | 'error';
    readonly activeCount: number;
    readonly waitingCount: number;
    readonly concurrency: number;
    readonly queueCapacity: number;
    readonly observations: {
      readonly commandAcceptedCount: number;
      readonly commandQueueFullCount: number;
      readonly commandNotReadyCount: number;
      readonly commandRunFailedCount: number;
      readonly startupQueueFullCount: number;
      readonly startupUnavailableCount: number;
      readonly runCompletedCount: number;
      readonly runFailedCount: number;
      readonly resultBatchCount: number;
      readonly resultRowCount: number;
      readonly resultBatchFailureCount: number;
      readonly lastRunDurationSeconds: number | null;
      readonly lastResultBatchDurationSeconds: number | null;
      readonly oldestActiveAgeSeconds: number | null;
      readonly oldestWaitingAgeSeconds: number | null;
      readonly lastFailureClass: string | null;
    };
  };
}
