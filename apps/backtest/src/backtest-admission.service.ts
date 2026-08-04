import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BacktestHealthStateService } from './backtest-health-state.service';
import { BacktestRunExecutor } from './backtest-run.executor';

export type BacktestAdmissionResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'queue_full' | 'not_ready' };

@Injectable()
export class BacktestAdmissionService {
  private readonly active = new Set<number>();
  private readonly waiting: number[] = [];
  private readonly waitingSet = new Set<number>();
  private readonly waitingEnqueuedAt = new Map<number, number>();
  private readonly activeStartedAt = new Map<number, number>();
  private ready = false;
  private readonly concurrency: number;
  private readonly capacity: number;

  constructor(
    config: ConfigService,
    private readonly executor: BacktestRunExecutor,
    private readonly health: BacktestHealthStateService,
  ) {
    this.concurrency = config.get<number>('BACKTEST_CONCURRENCY') ?? 2;
    this.capacity = config.get<number>('BACKTEST_QUEUE_CAPACITY') ?? 8;
    this.health.configure(this.concurrency, this.capacity);
  }

  setReady(ready: boolean): void {
    this.ready = ready;
    this.health.setReady(ready);
  }

  accept(runId: number): BacktestAdmissionResult {
    if (!this.ready) {
      this.health.recordCommand('not_ready');
      return { accepted: false, code: 'not_ready' };
    }
    if (this.active.has(runId) || this.waitingSet.has(runId)) {
      this.health.recordCommand('accepted');
      return { accepted: true };
    }
    if (this.active.size >= this.concurrency) {
      if (this.waiting.length >= this.capacity) {
        this.health.recordCommand('queue_full');
        return { accepted: false, code: 'queue_full' };
      }
      this.waiting.push(runId);
      this.waitingSet.add(runId);
      this.waitingEnqueuedAt.set(runId, Date.now());
      this.health.recordCommand('accepted');
      this.publishCounts();
      return { accepted: true };
    }
    this.health.recordCommand('accepted');
    this.start(runId);
    return { accepted: true };
  }

  activeCount(): number {
    return this.active.size;
  }

  waitingCount(): number {
    return this.waiting.length;
  }

  private start(runId: number): void {
    this.active.add(runId);
    this.activeStartedAt.set(runId, Date.now());
    this.publishCounts();
    void this.executor.execute(runId).finally(() => {
      this.active.delete(runId);
      this.activeStartedAt.delete(runId);
      const next = this.waiting.shift();
      if (next !== undefined) {
        this.waitingSet.delete(next);
        this.waitingEnqueuedAt.delete(next);
        this.start(next);
      } else {
        this.publishCounts();
      }
    });
  }

  private publishCounts(): void {
    this.health.setCounts(
      this.active.size,
      this.waiting.length,
      oldest(this.activeStartedAt),
      oldest(this.waitingEnqueuedAt),
    );
  }
}

function oldest(values: ReadonlyMap<number, number>): number | null {
  let oldestValue: number | null = null;
  for (const value of values.values()) {
    if (oldestValue === null || value < oldestValue) oldestValue = value;
  }
  return oldestValue;
}
