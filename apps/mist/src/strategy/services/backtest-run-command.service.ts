import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestRunStatus,
  StrategyDefinition,
  StrategyKind,
  StrategyVersion,
} from '@app/shared-data';
import { ChanBspConfigError, compileChanBspConfig } from '@app/signal';
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

export class BacktestCommandHttpException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly runId: number,
    readonly currentStatus?: BacktestRunStatus,
  ) {
    super(
      {
        code,
        message,
        data: {
          runId,
          ...(currentStatus ? { status: currentStatus } : {}),
        },
      },
      status,
    );
  }
}

type PendingFailureResult = {
  status: BacktestRunStatus | 'missing';
  updated: boolean;
};

@Injectable()
export class BacktestRunCommandService {
  constructor(
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    private readonly rpc: BacktestRpcClient,
    private readonly requestContext: HttpRequestContextService,
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
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
    const definition = await this.definitionRepository.findOne({
      where: { id: version.strategyDefinitionId },
    });
    if (!definition) {
      throw new NotFoundException(
        `Strategy definition ${version.strategyDefinitionId} not found`,
      );
    }

    let kind: StrategyKind;
    if (definition.kind === StrategyKind.CHAN_BSP) {
      // 分派编译先行：chan_bsp 配置不是 DSL 树，compileStoredVersion 会误编译。
      try {
        compileChanBspConfig(
          version.rule as Record<string, unknown>,
          definition.periods,
        );
      } catch (error) {
        if (error instanceof ChanBspConfigError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      if (
        dto.period !== 1 &&
        dto.period !== 5 &&
        dto.period !== 15 &&
        dto.period !== 30 &&
        dto.period !== 60
      ) {
        throw new BadRequestException({
          code: 'CHAN_BSP_PERIOD_UNSUPPORTED',
          message: 'chan_bsp replay period must be one of 1/5/15/30/60',
        });
      }
      kind = StrategyKind.CHAN_BSP;
    } else {
      kind = StrategyKind.RULE_DSL;
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
        kind,
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
        failed.status === BacktestRunStatus.RUNNING ||
        failed.status === BacktestRunStatus.COMPLETED ||
        (failed.status === BacktestRunStatus.FAILED && !failed.updated)
      ) {
        return receipt(run.id);
      }
      if (
        failed.status === 'missing' ||
        failed.status === BacktestRunStatus.PENDING
      ) {
        throw new BacktestCommandHttpException(
          500,
          'INTERNAL_ERROR',
          'Internal Server Error',
          run.id,
        );
      }
      if (result.error.code === 'queue_full') {
        throw new BacktestCommandHttpException(
          429,
          'BACKTEST_QUEUE_FULL',
          'Backtest queue is full',
          run.id,
          BacktestRunStatus.FAILED,
        );
      }
      throw new BacktestCommandHttpException(
        503,
        'BACKTEST_NOT_READY',
        'Backtest service is not ready',
        run.id,
        BacktestRunStatus.FAILED,
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
    const state = await this.markPendingFailed(
      runId,
      error.kind === 'timeout'
        ? 'BACKTEST_COMMAND_TIMEOUT'
        : error.kind === 'unavailable'
          ? 'BACKTEST_STARTUP_UNAVAILABLE'
          : 'BACKTEST_RPC_INTERNAL_ERROR',
    );
    if (error.kind === 'timeout') {
      if (state.updated) {
        throw new BacktestCommandHttpException(
          504,
          'BACKTEST_COMMAND_TIMEOUT',
          'Backtest command timed out',
          runId,
          BacktestRunStatus.FAILED,
        );
      }
      if (
        state.status === BacktestRunStatus.RUNNING ||
        state.status === BacktestRunStatus.COMPLETED ||
        state.status === BacktestRunStatus.FAILED
      ) {
        return receipt(runId);
      }
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
      );
    }
    if (error.kind === 'unavailable') {
      if (state.updated) {
        throw new BacktestCommandHttpException(
          503,
          'BACKTEST_UNAVAILABLE',
          'Backtest service is unavailable',
          runId,
          BacktestRunStatus.FAILED,
        );
      }
      if (
        state.status === BacktestRunStatus.RUNNING ||
        state.status === BacktestRunStatus.COMPLETED ||
        state.status === BacktestRunStatus.FAILED
      ) {
        return receipt(runId);
      }
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
      );
    }

    if (state.updated) {
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
        BacktestRunStatus.FAILED,
      );
    }
    if (
      state.status === BacktestRunStatus.RUNNING ||
      state.status === BacktestRunStatus.COMPLETED
    ) {
      return receipt(runId);
    }
    if (state.status === BacktestRunStatus.FAILED) {
      throw new BacktestCommandHttpException(
        500,
        'INTERNAL_ERROR',
        'Internal Server Error',
        runId,
        BacktestRunStatus.FAILED,
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
  ): Promise<PendingFailureResult> {
    try {
      const result = await this.runRepository.update(
        { id: runId, status: BacktestRunStatus.PENDING },
        {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage,
        },
      );
      if (result.affected === 1) {
        return { status: BacktestRunStatus.FAILED, updated: true };
      }
      const current = await this.runRepository.findOne({
        where: { id: runId },
      });
      return {
        status: current?.status ?? 'missing',
        updated: false,
      };
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
