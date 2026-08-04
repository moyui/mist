import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { BacktestRun, BacktestRunStatus } from '@app/shared-data';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  BacktestRpcClient,
  BacktestRpcTransportError,
} from './backtest-rpc.client';

const BACKTEST_STARTUP_HEALTH_TIMEOUT_MS = 3_000;

@Injectable()
export class BacktestStartupCompensationService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(BacktestStartupCompensationService.name);

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runs: Repository<BacktestRun>,
    private readonly rpc: BacktestRpcClient,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reconcileOnce().catch((error: unknown) => {
      this.logger.error(
        'Backtest startup compensation failed',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private async reconcileOnce(): Promise<void> {
    const cutoff = new Date();
    const pending = await this.runs.find({
      where: {
        status: BacktestRunStatus.PENDING,
        createdAt: LessThanOrEqual(cutoff),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (pending.length === 0) return;

    const healthy = await this.backtestReady();
    if (!healthy) {
      await this.failPending(pending, 'BACKTEST_STARTUP_UNAVAILABLE');
      return;
    }
    const correlationPrefix = 'backtest-startup';
    for (const run of pending) {
      try {
        const result = await this.rpc.submit(
          run.id,
          `${correlationPrefix}-${run.id}`,
        );
        if (!result.ok) {
          await this.failOne(
            run.id,
            `BACKTEST_${result.error.code.toUpperCase()}`,
          );
        }
      } catch (error) {
        const code =
          error instanceof BacktestRpcTransportError && error.kind === 'timeout'
            ? 'BACKTEST_COMMAND_TIMEOUT'
            : 'BACKTEST_STARTUP_UNAVAILABLE';
        await this.failOne(run.id, code);
      }
    }
  }

  private async backtestReady(): Promise<boolean> {
    const url = this.config.get<string>('BACKTEST_HEALTH_URL');
    if (!url) return false;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(BACKTEST_STARTUP_HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const body: unknown = await response.json();
      return (
        isRecord(body) &&
        isRecord(body.backtest) &&
        body.backtest.ready === true
      );
    } catch (error) {
      this.logger.warn(
        `Backtest startup health check failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }

  private async failPending(
    runs: readonly BacktestRun[],
    code: string,
  ): Promise<void> {
    for (const run of runs) await this.failOne(run.id, code);
  }

  private async failOne(runId: number, code: string): Promise<void> {
    await this.runs.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      {
        status: BacktestRunStatus.FAILED,
        completedAt: new Date(),
        errorMessage: code,
      },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
