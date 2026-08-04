import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestRunStatus,
  StrategyVersion,
} from '@app/shared-data';
import {
  HttpBusinessRejection,
  HttpRequestContextService,
} from '@app/transport/http';
import { Repository } from 'typeorm';
import {
  BacktestRpcClient,
  BacktestRpcTransportError,
} from '../runtime/backtest-rpc.client';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { BacktestRunReceiptVo } from '../vo/backtest-run-receipt.vo';
import { StrategyExecutionPlanService } from '../rules/strategy-execution-plan.service';

export class BacktestCommandHttpException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly runId: number,
  ) {
    super({ code, message, data: { runId } }, status);
  }
}

type PendingFailureStatus = BacktestRunStatus | 'missing';

@Injectable()
export class BacktestRunCommandService {
  constructor(
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    private readonly rpc: BacktestRpcClient,
    private readonly requestContext: HttpRequestContextService,
    private readonly planService: StrategyExecutionPlanService,
  ) {}

  async createRun(
    dto: CreateBacktestRunDto,
  ): Promise<
    | BacktestRunReceiptVo
    | HttpBusinessRejection<
        string,
        { runId: number; status: BacktestRunStatus }
      >
  > {
    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'startDate must not be after endDate',
      });
    }
    const version = await this.versionRepository.findOne({
      where: { id: dto.strategyVersionId },
    });
    if (!version) {
      throw new NotFoundException(
        `Strategy version ${dto.strategyVersionId} not found`,
      );
    }
    const plan = this.planService.compileStoredVersion(version);
    if (
      plan.fields.some((field) => field === 'k.volume' || field === 'k.amount')
    ) {
      throw new ConflictException({
        code: 'BACKTEST_QUANTITY_PROFILE_UNAVAILABLE',
        message:
          'Historical quantity profile is not approved for backtest replay',
      });
    }

    const run = await this.runRepository.save(
      this.runRepository.create({
        strategyDefinitionId: version.strategyDefinitionId,
        strategyVersionId: version.id,
        targetUniverse: dto.targetUniverse,
        targetIssues: [],
        period: dto.period,
        source: dto.source,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: BacktestRunStatus.PENDING,
        signalCount: 0,
        matchedSecurityCount: 0,
      }),
    );

    const correlationId = this.requestContext.getRequestId() ?? undefined;
    try {
      const result = await this.rpc.submit(run.id, correlationId);
      if (result.ok) return receipt(run.id);
      if (result.error.code === 'run_failed') {
        return new HttpBusinessRejection(
          'BACKTEST_RUN_ALREADY_FAILED',
          'Backtest run has already failed',
          { runId: run.id, status: BacktestRunStatus.FAILED },
        );
      }
      const failed = await this.markPendingFailed(
        run.id,
        `BACKTEST_${result.error.code.toUpperCase()}`,
      );
      if (
        failed === BacktestRunStatus.RUNNING ||
        failed === BacktestRunStatus.COMPLETED ||
        failed === BacktestRunStatus.FAILED
      ) {
        return receipt(run.id);
      }
      if (result.error.code === 'queue_full') {
        throw new BacktestCommandHttpException(
          429,
          'BACKTEST_QUEUE_FULL',
          'Backtest queue is full',
          run.id,
        );
      }
      throw new BacktestCommandHttpException(
        503,
        'BACKTEST_NOT_READY',
        'Backtest service is not ready',
        run.id,
      );
    } catch (error) {
      if (!(error instanceof BacktestRpcTransportError)) throw error;
      return await this.handleTransportFailure(run.id, error);
    }
  }

  private async handleTransportFailure(
    runId: number,
    error: BacktestRpcTransportError,
  ): Promise<BacktestRunReceiptVo> {
    if (error.kind === 'timeout') {
      const state = await this.markPendingFailed(
        runId,
        'BACKTEST_COMMAND_TIMEOUT',
      );
      if (
        state === BacktestRunStatus.RUNNING ||
        state === BacktestRunStatus.COMPLETED ||
        state === BacktestRunStatus.FAILED
      ) {
        return receipt(runId);
      }
      if (state === 'missing') {
        throw new BacktestCommandHttpException(
          500,
          'INTERNAL_ERROR',
          'Internal Server Error',
          runId,
        );
      }
      throw new BacktestCommandHttpException(
        504,
        'BACKTEST_COMMAND_TIMEOUT',
        'Backtest command timed out',
        runId,
      );
    }
    const state = await this.markPendingFailed(
      runId,
      'BACKTEST_STARTUP_UNAVAILABLE',
    );
    if (
      state === BacktestRunStatus.RUNNING ||
      state === BacktestRunStatus.COMPLETED ||
      state === BacktestRunStatus.FAILED
    ) {
      return receipt(runId);
    }
    if (state === 'missing') {
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
      );
    }
    if (error.kind === 'unavailable') {
      throw new BacktestCommandHttpException(
        503,
        'BACKTEST_UNAVAILABLE',
        'Backtest service is unavailable',
        runId,
      );
    }
    throw new BacktestCommandHttpException(
      500,
      'INTERNAL_ERROR',
      'Internal Server Error',
      runId,
    );
  }

  private async markPendingFailed(
    runId: number,
    errorMessage: string,
  ): Promise<PendingFailureStatus> {
    try {
      const result = await this.runRepository.update(
        { id: runId, status: BacktestRunStatus.PENDING },
        {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage,
        },
      );
      if (result.affected === 1) return BacktestRunStatus.FAILED;
      const current = await this.runRepository.findOne({
        where: { id: runId },
      });
      return current?.status ?? 'missing';
    } catch {
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
      );
    }
  }
}

function receipt(runId: number): BacktestRunReceiptVo {
  return { runId, initialStatus: 'PENDING' };
}
