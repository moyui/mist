import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
} from '@app/shared-data';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { BacktestAdmissionService } from './backtest-admission.service';
import { BacktestHealthStateService } from './backtest-health-state.service';

@Injectable()
export class BacktestStartupService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(BacktestRun)
    private readonly runs: Repository<BacktestRun>,
    private readonly admission: BacktestAdmissionService,
    private readonly health: BacktestHealthStateService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const stale = await manager.find(BacktestRun, {
        where: { status: BacktestRunStatus.RUNNING },
        select: { id: true },
      });
      for (const run of stale) {
        const updated = await manager.update(
          BacktestRun,
          { id: run.id, status: BacktestRunStatus.RUNNING },
          {
            status: BacktestRunStatus.FAILED,
            completedAt: new Date(),
            errorMessage: 'BACKTEST_INTERRUPTED',
          },
        );
        if (updated.affected === 1) {
          await manager.delete(BacktestSignalResult, { backtestRunId: run.id });
        }
      }
    });
    const concurrency = this.config.get<number>('BACKTEST_CONCURRENCY') ?? 2;
    const capacity = this.config.get<number>('BACKTEST_QUEUE_CAPACITY') ?? 8;
    const cutoff = new Date();
    const pending = await this.runs.find({
      where: {
        status: BacktestRunStatus.PENDING,
        createdAt: LessThanOrEqual(cutoff),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: concurrency + capacity + 1,
    });
    const admitted = pending.slice(0, concurrency + capacity);
    const overflow = pending.slice(concurrency + capacity);
    for (const run of overflow) {
      await this.runs.update(
        { id: run.id, status: BacktestRunStatus.PENDING },
        {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: 'BACKTEST_STARTUP_QUEUE_FULL',
        },
      );
      this.health.recordStartupFailure('queue_full');
    }
    this.admission.setReady(true);
    this.health.setCounts(0, 0);
    for (const run of admitted) this.admission.accept(run.id);
  }
}
