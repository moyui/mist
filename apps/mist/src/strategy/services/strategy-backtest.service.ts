import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  K,
  StrategyVersion,
} from '@app/shared-data';
import { Between, In, Repository } from 'typeorm';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';
import { StrategyEvaluationContextBuilder } from '../scanner/strategy-evaluation-context.builder';

@Injectable()
export class StrategyBacktestService {
  constructor(
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(BacktestRun)
    private readonly backtestRunRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly signalResultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    private readonly contextBuilder: StrategyEvaluationContextBuilder,
    private readonly ruleEvaluator: StrategyRuleEvaluator,
  ) {}

  async createRun(dto: CreateBacktestRunDto): Promise<BacktestRun> {
    const version = await this.versionRepository.findOne({
      where: { id: dto.strategyVersionId },
    });

    if (!version) {
      throw new NotFoundException(
        `Strategy version ${dto.strategyVersionId} not found`,
      );
    }

    const run = await this.backtestRunRepository.save(
      this.backtestRunRepository.create({
        strategyDefinitionId: version.strategyDefinitionId,
        strategyVersionId: version.id,
        targetUniverse: dto.targetUniverse,
        period: dto.period,
        source: dto.source,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: BacktestRunStatus.PENDING,
        signalCount: 0,
        matchedSecurityCount: 0,
      }),
    );

    return await this.executeRun(run, version);
  }

  async findRun(runId: number): Promise<BacktestRun> {
    const run = await this.backtestRunRepository.findOne({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Backtest run ${runId} not found`);
    }

    return run;
  }

  async listSignals(runId: number): Promise<BacktestSignalResult[]> {
    await this.findRun(runId);
    return await this.signalResultRepository.find({
      where: { backtestRunId: runId },
      order: { signalTime: 'ASC' },
    });
  }

  private async executeRun(
    run: BacktestRun,
    version: StrategyVersion,
  ): Promise<BacktestRun> {
    run.status = BacktestRunStatus.RUNNING;
    run.startedAt = new Date();
    await this.backtestRunRepository.save(run);

    try {
      const rows = await this.kRepository.find({
        where: {
          security: { code: In(run.targetUniverse) },
          period: run.period,
          source: run.source,
          timestamp: Between(run.startDate, run.endDate),
        },
        relations: ['security'],
        order: { timestamp: 'ASC' },
      });
      const matchedSecurityCodes = new Set<string>();
      let signalCount = 0;

      for (const row of rows) {
        const context = this.contextBuilder.buildFromK(row);
        const evaluation = this.ruleEvaluator.evaluate(
          version.rule,
          context as unknown as Record<string, unknown>,
        );

        if (!evaluation.matched) continue;

        await this.signalResultRepository.save(
          this.signalResultRepository.create({
            backtestRun: run,
            backtestRunId: run.id,
            securityCode: row.security.code,
            signalTime: row.timestamp,
            contextSnapshot: context,
            ruleSnapshot: version.rule,
          }),
        );

        signalCount += 1;
        matchedSecurityCodes.add(row.security.code);
      }

      run.status = BacktestRunStatus.COMPLETED;
      run.signalCount = signalCount;
      run.matchedSecurityCount = matchedSecurityCodes.size;
      run.completedAt = new Date();
      run.errorMessage = null;
      return await this.backtestRunRepository.save(run);
    } catch (error) {
      run.status = BacktestRunStatus.FAILED;
      run.completedAt = new Date();
      run.errorMessage =
        error instanceof Error ? error.message : 'Backtest replay failed';
      await this.backtestRunRepository.save(run);
      throw error;
    }
  }
}
