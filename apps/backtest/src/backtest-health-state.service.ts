import { Injectable } from '@nestjs/common';
import type { BacktestHealthVo } from './backtest-health.vo';

@Injectable()
export class BacktestHealthStateService {
  private state: BacktestHealthVo['backtest']['state'] = 'starting';
  private activeCount = 0;
  private waitingCount = 0;
  private concurrency = 2;
  private queueCapacity = 8;

  configure(concurrency: number, queueCapacity: number): void {
    this.concurrency = concurrency;
    this.queueCapacity = queueCapacity;
  }

  setReady(ready: boolean): void {
    this.state = ready ? 'ready' : 'error';
  }

  setCounts(activeCount: number, waitingCount: number): void {
    this.activeCount = activeCount;
    this.waitingCount = waitingCount;
  }

  snapshot(): BacktestHealthVo {
    return {
      status: 'ok',
      service: 'backtest',
      backtest: {
        ready: this.state === 'ready',
        state: this.state,
        activeCount: this.activeCount,
        waitingCount: this.waitingCount,
        concurrency: this.concurrency,
        queueCapacity: this.queueCapacity,
      },
    };
  }
}
