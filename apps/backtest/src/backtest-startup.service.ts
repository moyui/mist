import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
} from '@app/shared-data';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { BacktestAdmissionService } from './backtest-admission.service';
import { HealthStateService } from './health/health-state.service';

@Injectable()
export class BacktestStartupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BacktestStartupService.name);
  constructor(
    @InjectRepository(BacktestRun)
    private readonly runs: Repository<BacktestRun>,
    private readonly admission: BacktestAdmissionService,
    private readonly health: HealthStateService,
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
    const admissionLimit = concurrency + capacity;
    const pending = await this.runs.find({
      where: {
        status: BacktestRunStatus.PENDING,
        createdAt: LessThanOrEqual(cutoff),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: admissionLimit + 1,
    });
    const admitted = pending.slice(0, admissionLimit);
    const admittedIds = admitted.map((run) => run.id);
    const overflow = this.runs
      .createQueryBuilder()
      .update(BacktestRun)
      .set({
        status: BacktestRunStatus.FAILED,
        completedAt: new Date(),
        errorMessage: 'BACKTEST_STARTUP_QUEUE_FULL',
      })
      .where('status = :pendingStatus', {
        pendingStatus: BacktestRunStatus.PENDING,
      })
      .andWhere('created_at <= :cutoff', { cutoff });
    if (admittedIds.length > 0) {
      overflow.andWhere('id NOT IN (:...admittedIds)', { admittedIds });
    }
    const overflowResult = await overflow.execute();
    if (overflowResult.affected) {
      this.health.recordStartupFailure('queue_full', overflowResult.affected);
      this.logger.error(
        `backtest startup_failure kind=queue_full count=${overflowResult.affected}`,
      );
    }
    this.health.setCounts(0, 0);
    const startNow = this.admission.restorePending(
      admitted.map((run) => run.id),
    );
    this.admission.setReady(true);
    this.admission.startReserved(startNow);
    this.logger.log(
      `backtest startup reconciled admitted=${admittedIds.length}`,
    );
  }
}
