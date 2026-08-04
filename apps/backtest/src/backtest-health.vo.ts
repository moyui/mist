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
  };
}
