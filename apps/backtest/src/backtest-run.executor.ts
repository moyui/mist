import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  DataSource,
  Security,
  StrategyVersion,
  type BacktestTargetIssue,
} from '@app/shared-data';
import {
  compileStoredStrategyRule,
  evaluateStrategyPlan,
  QuantityForwardFillProjector,
  serializeStrategyContextSnapshot,
  type CompiledStrategyExecutionPlan,
  type ProjectedStrategyBar,
  type StrategyMarketSource,
} from '@app/strategy';
import { DataSource as TypeOrmDataSource, In, Repository } from 'typeorm';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';
import { BacktestRunFailure } from './backtest-run-error';

const BACKTEST_CALCULATION_BATCH_SIZE = 100;
const BACKTEST_RESULT_BATCH_SIZE = 100;

class ReplayBudget {
  consumed = 0;

  constructor(
    private readonly maxBars: number,
    private readonly deadlineAt: number,
  ) {}

  consume(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
    this.consumed += 1;
    if (this.consumed > this.maxBars) {
      throw new BacktestRunFailure('BACKTEST_BAR_LIMIT_EXCEEDED');
    }
  }

  checkDeadline(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
  }
}

@Injectable()
export class BacktestRunExecutor {
  private readonly logger = new Logger(BacktestRunExecutor.name);

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly resultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly marketData: BacktestMarketDataAdapter,
    private readonly dataSource: TypeOrmDataSource,
    private readonly config: ConfigService,
  ) {}

  async execute(runId: number): Promise<void> {
    const claimed = await this.claim(runId);
    if (!claimed) return;

    try {
      await this.replay(claimed);
    } catch (error) {
      await this.failAndCleanup(runId, classifyFailure(error));
      this.logger.error(`Backtest run ${runId} failed`, errorTrace(error));
    }
  }

  private async claim(runId: number): Promise<BacktestRun | null> {
    const result = await this.runRepository.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      { status: BacktestRunStatus.RUNNING, startedAt: new Date() },
    );
    if (result.affected !== 1) return null;
    return this.runRepository.findOne({ where: { id: runId } });
  }

  private async replay(run: BacktestRun): Promise<void> {
    if (run.source !== DataSource.TDX && run.source !== DataSource.QMT) {
      throw new BacktestRunFailure('BACKTEST_SOURCE_UNSUPPORTED');
    }
    if (run.targetUniverse.length === 0) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }

    const version = await this.versionRepository.findOne({
      where: { id: run.strategyVersionId },
    });
    if (!version) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    const plan = compileStoredStrategyRule(
      version.rule,
      version.signalKind as 'entry' | 'exit',
    );
    if (
      plan.fields.some((field) => field === 'k.volume' || field === 'k.amount')
    ) {
      throw new BacktestRunFailure('BACKTEST_QUANTITY_PROFILE_UNAVAILABLE');
    }

    const timeoutMs =
      this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS') ?? 1_800_000;
    const maxBars =
      this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN') ?? 10_000_000;
    const budget = new ReplayBudget(maxBars, Date.now() + timeoutMs);

    const normalizedTargets = [
      ...new Set(run.targetUniverse.map(normalizeCode)),
    ];
    const securities = await this.securityRepository.find({
      where: { code: In(normalizedTargets) },
    });
    const byCode = new Map(
      securities.map((security) => [security.code, security]),
    );
    const issues: BacktestTargetIssue[] = [];
    const executable = normalizedTargets.filter((code) => {
      if (!byCode.has(code)) {
        issues.push({ securityCode: code, code: 'SECURITY_NOT_FOUND' });
        return false;
      }
      return true;
    });
    if (executable.length === 0) {
      run.targetIssues = uniqueIssues(issues);
      await this.runRepository.save(run);
      throw new BacktestRunFailure('BACKTEST_NO_EXECUTABLE_TARGETS');
    }

    const results: BacktestSignalResult[] = [];
    let signalCount = 0;
    const matchedCodes = new Set<string>();
    for (const code of executable) {
      const security = byCode.get(code);
      if (!security) continue;
      const outcome = await this.replaySecurity(
        run,
        plan,
        version.rule,
        code,
        security.id,
        results,
        matchedCodes,
        budget,
        () => {
          signalCount += 1;
        },
      );
      if (!outcome.hasBars)
        issues.push({ securityCode: code, code: 'NO_HISTORICAL_BARS' });
    }
    await this.flushResults(results);

    if (issues.length > 0) {
      run.targetIssues = uniqueIssues(issues);
    }
    run.status = BacktestRunStatus.COMPLETED;
    run.signalCount = signalCount;
    run.matchedSecurityCount = matchedCodes.size;
    run.completedAt = new Date();
    run.errorMessage = null;
    await this.runRepository.save(run);
  }

  private async replaySecurity(
    run: BacktestRun,
    plan: CompiledStrategyExecutionPlan,
    ruleSnapshot: Record<string, unknown>,
    securityCode: string,
    securityId: number,
    results: BacktestSignalResult[],
    matchedCodes: Set<string>,
    budget: ReplayBudget,
    onSignal: () => void,
  ): Promise<{ hasBars: boolean }> {
    const projector = new QuantityForwardFillProjector();
    const windows: ProjectedStrategyBar[] = [];
    let afterTimestamp: Date | undefined;
    let hasBars = false;
    const replayStart = replayStartFor(run, plan);
    const replayEnd = new Date(run.endDate.getTime());
    while (true) {
      const page = await this.marketData.readReplayPage({
        securityId,
        source: run.source as StrategyMarketSource,
        period: run.period,
        startAt: replayStart,
        endAt: replayEnd,
        ...(afterTimestamp ? { afterTimestamp } : {}),
      });
      for (const bar of page.bars) {
        budget.consume();
        hasBars = true;
        const projected = projector.project(bar);
        windows.push(projected);
        if (windows.length > plan.requiredBarCount) windows.shift();
        if (bar.timestamp < run.startDate) continue;
        const evaluation = evaluateStrategyPlan(plan, windows);
        if (evaluation.status !== 'evaluated' || !evaluation.matched) continue;
        results.push(
          this.resultRepository.create({
            backtestRunId: run.id,
            securityCode,
            signalTime: bar.timestamp,
            contextSnapshot: serializeStrategyContextSnapshot(
              plan,
              evaluation.context,
            ) as Record<string, unknown>,
            ruleSnapshot,
          }),
        );
        matchedCodes.add(securityCode);
        onSignal();
        if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
          await this.flushResults(results);
        await checkpoint(budget);
      }
      if (!page.nextAfterTimestamp) break;
      afterTimestamp = page.nextAfterTimestamp;
    }
    return { hasBars };
  }

  private async flushResults(results: BacktestSignalResult[]): Promise<void> {
    if (results.length === 0) return;
    const pending = results.splice(0, results.length);
    // TypeORM's JSON DeepPartial type rejects Record<string, unknown> even
    // though it is the entity's declared JSON boundary; keep this cast local
    // to the batch writer rather than weakening the entity contract.
    await this.resultRepository.insert(
      pending.map((result) => ({
        backtestRunId: result.backtestRunId,
        securityCode: result.securityCode,
        signalTime: result.signalTime,
        contextSnapshot: result.contextSnapshot,
        ruleSnapshot: result.ruleSnapshot,
      })) as never,
    );
  }

  private async failAndCleanup(
    runId: number,
    failure: BacktestRunFailure,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const updated = await manager.update(
          BacktestRun,
          { id: runId, status: BacktestRunStatus.RUNNING },
          {
            status: BacktestRunStatus.FAILED,
            completedAt: new Date(),
            errorMessage: failure.code,
          },
        );
        if (updated.affected !== 1) return;
        await manager.delete(BacktestSignalResult, { backtestRunId: runId });
      });
    } catch (error) {
      this.logger.error(
        `Backtest cleanup failed for ${runId}`,
        errorTrace(error),
      );
    }
  }
}

function normalizeCode(value: string): string {
  return value.trim();
}

function uniqueIssues(
  issues: readonly BacktestTargetIssue[],
): BacktestTargetIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.securityCode}\u0000${issue.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function checkpoint(budget: ReplayBudget): Promise<void> {
  budget.checkDeadline();
  if (budget.consumed % BACKTEST_CALCULATION_BATCH_SIZE === 0) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    budget.checkDeadline();
  }
}

function replayStartFor(
  run: BacktestRun,
  plan: CompiledStrategyExecutionPlan,
): Date {
  if (
    run.period >= 1_440 ||
    !plan.fields.some((field) => field === 'k.volume' || field === 'k.amount')
  ) {
    return new Date(run.startDate.getTime());
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(run.startDate);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day)
    throw new TypeError('invalid replay trading day');
  return new Date(`${year}-${month}-${day}T01:30:00.000Z`);
}

function classifyFailure(error: unknown): BacktestRunFailure {
  if (error instanceof BacktestRunFailure) return error;
  return new BacktestRunFailure(
    'BACKTEST_DATABASE_ERROR',
    'BACKTEST_DATABASE_ERROR',
    error,
  );
}

function errorTrace(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
