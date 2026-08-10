import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { BacktestRun, BacktestRunStatus } from '@app/shared-data';
import type { Repository } from 'typeorm';
import { BacktestHealthStateService } from './backtest-health-state.service';
import { BacktestRunExecutor } from './backtest-run.executor';

export type BacktestAdmissionResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly code: 'queue_full' | 'not_ready' | 'run_failed';
    };

@Injectable()
export class BacktestAdmissionService {
  private readonly logger = new Logger(BacktestAdmissionService.name);
  private readonly active = new Set<number>();
  private readonly waiting: number[] = [];
  private readonly waitingSet = new Set<number>();
  private readonly waitingEnqueuedAt = new Map<number, number>();
  private readonly activeStartedAt = new Map<number, number>();
  private readonly chains = new Map<number, Promise<void>>();
  private ready = false;
  private readonly concurrency: number;
  private readonly capacity: number;

  constructor(
    config: ConfigService,
    private readonly executor: BacktestRunExecutor,
    private readonly health: BacktestHealthStateService,
    @InjectRepository(BacktestRun)
    private readonly runs: Repository<BacktestRun>,
  ) {
    this.concurrency = config.get<number>('BACKTEST_CONCURRENCY') ?? 2;
    this.capacity = config.get<number>('BACKTEST_QUEUE_CAPACITY') ?? 8;
    this.health.configure(this.concurrency, this.capacity);
  }

  setReady(ready: boolean): void {
    this.ready = ready;
    this.health.setReady(ready);
  }

  accept(runId: number): Promise<BacktestAdmissionResult> {
    const previous = this.chains.get(runId) ?? Promise.resolve();
    const current = previous.then(() => this.acceptOne(runId));
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(runId, tail);
    void tail.then(
      () => this.removeChain(runId, tail),
      () => this.removeChain(runId, tail),
    );
    return current;
  }

  activeCount(): number {
    return this.active.size;
  }

  waitingCount(): number {
    return this.waiting.length;
  }

  /**
   * Rebuilds the in-memory startup reservation without opening a command
   * admission window. The caller must set readiness only after this returns,
   * then launch the returned active identities.
   */
  restorePending(runIds: readonly number[]): number[] {
    const startNow: number[] = [];
    for (const runId of runIds) {
      const reservation = this.reservePending(runId);
      if (!reservation.accepted) {
        throw new Error(`backtest startup admission rejected ${runId}`);
      }
      if (reservation.startNow) startNow.push(runId);
    }
    return startNow;
  }

  startReserved(runIds: readonly number[]): void {
    if (!this.ready) throw new Error('backtest admission is not ready');
    for (const runId of runIds) this.start(runId);
  }

  private async acceptOne(runId: number): Promise<BacktestAdmissionResult> {
    if (!this.ready) {
      this.health.recordCommand('not_ready');
      this.logger.warn(
        `backtest command rejected reason=not_ready runId=${runId}`,
      );
      return { accepted: false, code: 'not_ready' };
    }
    if (this.active.has(runId) || this.waitingSet.has(runId)) {
      this.health.recordCommand('accepted');
      this.logger.log(`backtest command accepted runId=${runId}`);
      return { accepted: true };
    }

    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) throw new Error(`backtest run ${runId} does not exist`);
    if (run.status === BacktestRunStatus.FAILED) {
      this.health.recordCommand('run_failed');
      this.logger.warn(
        `backtest command rejected reason=run_failed runId=${runId}`,
      );
      return { accepted: false, code: 'run_failed' };
    }
    if (run.status !== BacktestRunStatus.PENDING) {
      this.health.recordCommand('accepted');
      this.logger.log(`backtest command accepted runId=${runId}`);
      return { accepted: true };
    }

    // The database read above is the only await before this synchronous
    // reservation. The Node event loop therefore makes capacity/reservation
    // atomic for this process; the keyed chain prevents same-run races.
    const reservation = this.reservePending(runId);
    if (!reservation.accepted) {
      this.health.recordCommand('queue_full');
      this.logger.warn(
        `backtest command rejected reason=queue_full runId=${runId}`,
      );
      return reservation;
    }
    this.health.recordCommand('accepted');
    this.logger.log(`backtest command accepted runId=${runId}`);
    if (reservation.startNow) this.start(runId);
    return { accepted: true };
  }

  private reservePending(
    runId: number,
  ): BacktestAdmissionResult & { readonly startNow?: boolean } {
    if (this.active.has(runId) || this.waitingSet.has(runId)) {
      return { accepted: true, startNow: false };
    }
    if (this.active.size >= this.concurrency) {
      if (this.waiting.length >= this.capacity) {
        return { accepted: false, code: 'queue_full' };
      }
      this.waiting.push(runId);
      this.waitingSet.add(runId);
      this.waitingEnqueuedAt.set(runId, Date.now());
      this.publishCounts();
      return { accepted: true, startNow: false };
    }
    this.active.add(runId);
    this.activeStartedAt.set(runId, Date.now());
    this.publishCounts();
    return { accepted: true, startNow: true };
  }

  private removeChain(runId: number, tail: Promise<void>): void {
    if (this.chains.get(runId) === tail) this.chains.delete(runId);
  }

  private start(runId: number): void {
    if (!this.active.has(runId)) {
      throw new Error(`backtest run ${runId} is not reserved`);
    }
    this.publishCounts();
    let execution: Promise<void>;
    try {
      execution = Promise.resolve(this.executor.execute(runId));
    } catch (error) {
      execution = Promise.reject(error);
    }
    void execution.then(
      () => this.release(runId),
      () => this.release(runId),
    );
  }

  private release(runId: number): void {
    this.active.delete(runId);
    this.activeStartedAt.delete(runId);
    const next = this.waiting.shift();
    if (next !== undefined) {
      this.waitingSet.delete(next);
      this.waitingEnqueuedAt.delete(next);
      this.active.add(next);
      this.activeStartedAt.set(next, Date.now());
      this.start(next);
    } else {
      this.publishCounts();
    }
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
