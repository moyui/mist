export interface BacktestHealthVo {
  readonly status: 'ok';
  readonly service: 'backtest';
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
