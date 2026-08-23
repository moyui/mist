import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  DataSource,
  Security,
  StrategyDefinition,
  StrategyKind,
  StrategyVersion,
  type BacktestTargetIssue,
} from '@app/shared-data';
import {
  compileStoredStrategyRule,
  evaluateStrategyPlan,
  serializeStrategyContextSnapshot,
  StrategySeriesImputer,
  type CompiledStrategyExecutionPlan,
  type StrategyMarketSource,
  type StrategyRealtimeSource,
} from '@app/strategy';
import {
  ChanBspDetector,
  ChanBspEpisodeCursor,
  serializeChanBspContextSnapshot,
  compileChanBspConfig,
  type ChanBspEpisodeIdentity,
  type ChanBspPlan,
} from '@app/signal';
import { DataSource as TypeOrmDataSource, In, Repository } from 'typeorm';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';
import { BacktestRunFailure } from './backtest-run-error';
import { BacktestHealthStateService } from './backtest-health-state.service';

const BACKTEST_CALCULATION_BATCH_SIZE = 100;
const BACKTEST_RESULT_BATCH_SIZE = 100;

/**
 * Per-run compiled plan union: the evaluator selected by `backtest_runs.kind`.
 * `rule_dsl` keeps the existing compiled-rule path; `chan_bsp` carries the
 * shared Chan buy/sell point plan. Both expose `requiredBarCount`.
 */
type ReplayPlan =
  | { kind: 'rule_dsl'; plan: CompiledStrategyExecutionPlan }
  | { kind: 'chan_bsp'; plan: ChanBspPlan };

const CHAN_BSP_REPLAY_LEVELS: readonly number[] = [1, 5, 15, 30, 60];

class ReplayBudget {
  consumed = 0;
  private lastYieldConsumed = -1;

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

  async checkpoint(forceYield = false): Promise<void> {
    this.checkDeadline();
    const shouldYield =
      forceYield || this.consumed % BACKTEST_CALCULATION_BATCH_SIZE === 0;
    if (!shouldYield || this.lastYieldConsumed === this.consumed) return;
    this.lastYieldConsumed = this.consumed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.checkDeadline();
  }
}

@Injectable()
export class BacktestRunExecutor {
  private readonly logger = new Logger(BacktestRunExecutor.name);
  private readonly chanBspDetector = new ChanBspDetector();
  private readonly chanBspCursors = new Map<number, ChanBspEpisodeCursor>();

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly resultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    private readonly marketData: BacktestMarketDataAdapter,
    private readonly dataSource: TypeOrmDataSource,
    private readonly config: ConfigService,
    private readonly health: BacktestHealthStateService,
  ) {}

  async execute(runId: number): Promise<void> {
    let claimed: BacktestRun | null;
    try {
      claimed = await this.claim(runId);
    } catch (error) {
      this.health.recordRunFailed('BACKTEST_DATABASE_ERROR', 0);
      await this.failAndCleanup(runId, classifyFailure(error));
      this.logger.error(
        `Backtest run ${runId} could not be claimed`,
        errorTrace(error),
      );
      return;
    }
    if (!claimed) return;

    const startedAt = Date.now();
    try {
      await this.replay(claimed);
      const durationMs = Date.now() - startedAt;
      this.health.recordRunCompleted(durationMs);
      this.logger.log(
        `backtest run completed runId=${runId} durationMs=${durationMs}`,
      );
    } catch (error) {
      const failure = classifyFailure(error);
      this.health.recordRunFailed(failure.code, Date.now() - startedAt);
      await this.failAndCleanup(runId, failure);
      this.logger.error(
        `Backtest run ${runId} failed reason=${failure.code}`,
        errorTrace(error),
      );
    }
  }

  private async claim(runId: number): Promise<BacktestRun | null> {
    const result = await this.runRepository.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      { status: BacktestRunStatus.RUNNING, startedAt: new Date() },
    );
    if (result.affected !== 1) return null;
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) throw new Error(`claimed backtest run ${runId} disappeared`);
    return run;
  }

  private async replay(run: BacktestRun): Promise<void> {
    if (run.source !== DataSource.TDX && run.source !== DataSource.QMT) {
      throw new BacktestRunFailure('BACKTEST_SOURCE_UNSUPPORTED');
    }
    if (!Array.isArray(run.targetUniverse) || run.targetUniverse.length === 0) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }

    const version = await this.versionRepository.findOne({
      where: { id: run.strategyVersionId },
    });
    if (!version) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    const definition = await this.definitionRepository.findOne({
      where: { id: run.strategyDefinitionId },
    });
    if (!definition) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');

    const plan: ReplayPlan =
      run.kind === StrategyKind.CHAN_BSP
        ? {
            kind: 'chan_bsp',
            plan: compileChanBspConfig(
              version.rule as Record<string, unknown>,
              definition.periods,
            ),
          }
        : {
            kind: 'rule_dsl',
            plan: compileStoredStrategyRule(
              version.rule,
              version.signalKind as 'entry' | 'exit',
            ),
          };
    if (
      run.kind === StrategyKind.CHAN_BSP &&
      !CHAN_BSP_REPLAY_LEVELS.includes(run.period)
    ) {
      throw new BacktestRunFailure('BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED');
    }
    if (plan.kind === 'chan_bsp') {
      this.logger.log(
        `backtest chan_bsp plan compiled runId=${run.id} level=${run.period} units=${plan.plan.units}`,
      );
    }

    const timeoutMs =
      this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS') ?? 1_800_000;
    const maxBars =
      this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN') ?? 10_000_000;
    const budget = new ReplayBudget(maxBars, Date.now() + timeoutMs);

    if (run.targetUniverse.some((code) => typeof code !== 'string')) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const normalizedTargets = [
      ...new Set(run.targetUniverse.map(normalizeCode)),
    ];
    if (
      normalizedTargets.length === 0 ||
      normalizedTargets.some((code) => code.length === 0)
    ) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const securities = await this.securityRepository.find({
      where: { code: In(normalizedTargets) },
    });
    const byCode = new Map(
      securities.map((security) => [security.code, security]),
    );
    const issues: BacktestTargetIssue[] = [];
    const executable: Array<{ code: string; security: Security }> = [];
    const seenSecurityIds = new Set<number>();
    for (const code of normalizedTargets) {
      if (!byCode.has(code)) {
        issues.push({ securityCode: code, code: 'SECURITY_NOT_FOUND' });
        this.health.recordTargetIssue('SECURITY_NOT_FOUND');
        this.logger.warn(
          `backtest target_issue code=SECURITY_NOT_FOUND securityCode=${code}`,
        );
        continue;
      }
      const security = byCode.get(code);
      if (!security || seenSecurityIds.has(security.id)) continue;
      seenSecurityIds.add(security.id);
      executable.push({ code, security });
    }
    if (executable.length === 0) {
      throw new BacktestRunFailure(
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        undefined,
        uniqueIssues(issues),
      );
    }

    const results: BacktestSignalResult[] = [];
    let signalCount = 0;
    const matchedCodes = new Set<string>();
    for (const { code, security } of executable) {
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
      if (!outcome.hasBars) {
        issues.push({ securityCode: code, code: 'NO_HISTORICAL_BARS' });
        this.health.recordTargetIssue('NO_HISTORICAL_BARS');
        this.logger.warn(
          `backtest target_issue code=NO_HISTORICAL_BARS securityCode=${code}`,
        );
      }
    }
    await this.flushResults(results);

    const completed = await this.runRepository.update(
      { id: run.id, status: BacktestRunStatus.RUNNING },
      {
        status: BacktestRunStatus.COMPLETED,
        targetIssues: uniqueIssues(issues),
        signalCount,
        matchedSecurityCount: matchedCodes.size,
        completedAt: new Date(),
        errorMessage: null,
      },
    );
    if (completed.affected !== 1) {
      throw new BacktestRunFailure('BACKTEST_DATABASE_ERROR');
    }
  }

  private async replaySecurity(
    run: BacktestRun,
    plan: ReplayPlan,
    ruleSnapshot: Record<string, unknown>,
    securityCode: string,
    securityId: number,
    results: BacktestSignalResult[],
    matchedCodes: Set<string>,
    budget: ReplayBudget,
    onSignal: () => void,
  ): Promise<{ hasBars: boolean }> {
    const imputer = new StrategySeriesImputer();
    let afterTimestamp: Date | undefined;
    let hasPublicBars = false;
    const replayStart = replayStartFor(run, plan);
    const replayEnd = new Date(run.endDate.getTime());
    const cursor =
      this.chanBspCursors.get(securityId) ?? new ChanBspEpisodeCursor();
    this.chanBspCursors.set(securityId, cursor);

    // ① 准备阶段：首个评估点前的初始窗口段，整段双向补齐定死。以 replayStart 为界
    //    （而非 startDate）——对消费量价的分钟级 plan，replayStart = 当日开盘，initial
    //    只取开盘前的历史，与 ② 的 replay page（从 replayStart 起）天然不重叠；锚点
    //    全部 < replayStart，无 look-ahead。窗口不满时维持 insufficient_history
    //    （builder 现有逻辑）。
    const initial = await this.marketData.loadReplayWindow({
      securityId,
      source: run.source as StrategyRealtimeSource,
      period: run.period,
      endAt: replayStart,
      requiredBars: plan.plan.requiredBarCount,
    });
    for (let index = 0; index < initial.bars.length; index += 1) {
      budget.consume();
    }
    imputer.hydrate(initial.bars);

    // ② 计算阶段：逐根 append（只 forward-fill 新 bar）+ 滑动窗口 + 评估。
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
        if (bar.timestamp >= run.startDate) hasPublicBars = true;
        imputer.append(bar);
        while (imputer.read().length > plan.plan.requiredBarCount) {
          imputer.trim();
        }
        if (bar.timestamp >= run.startDate) {
          if (plan.kind === 'chan_bsp') {
            // 矫正层第一原则：detector 只吃 imputer.read() 的矫正视图。
            const events = this.chanBspDetector.evaluate(
              imputer.read(),
              plan.plan,
            );
            const identity: ChanBspEpisodeIdentity = {
              definitionId: run.strategyDefinitionId,
              securityId,
              source: run.source as StrategyRealtimeSource,
              level: run.period,
              units: plan.plan.units,
            };
            const fresh = cursor.advance(identity, events);
            for (const event of fresh) {
              results.push(
                this.resultRepository.create({
                  backtestRunId: run.id,
                  securityCode,
                  signalTime: event.time,
                  contextSnapshot: serializeChanBspContextSnapshot(
                    event,
                    run.period,
                  ) as Record<string, unknown>,
                  ruleSnapshot,
                }),
              );
            }
            if (fresh.length > 0) {
              matchedCodes.add(securityCode);
              onSignal();
              if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
                await this.flushResults(results);
            }
          } else {
            const evaluation = evaluateStrategyPlan(plan.plan, imputer.read());
            if (evaluation.status === 'evaluated' && evaluation.matched) {
              results.push(
                this.resultRepository.create({
                  backtestRunId: run.id,
                  securityCode,
                  signalTime: bar.timestamp,
                  contextSnapshot: serializeStrategyContextSnapshot(
                    plan.plan,
                    evaluation.context,
                  ) as Record<string, unknown>,
                  ruleSnapshot,
                }),
              );
              matchedCodes.add(securityCode);
              onSignal();
              if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
                await this.flushResults(results);
            }
          }
        }
        await budget.checkpoint();
      }
      await budget.checkpoint(true);
      if (!page.nextAfterTimestamp) break;
      const lastBar = page.bars.at(-1);
      if (
        !lastBar ||
        page.nextAfterTimestamp <= lastBar.timestamp ||
        (afterTimestamp && page.nextAfterTimestamp <= afterTimestamp)
      ) {
        throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
      }
      afterTimestamp = page.nextAfterTimestamp;
    }
    return { hasBars: hasPublicBars };
  }

  private async flushResults(results: BacktestSignalResult[]): Promise<void> {
    if (results.length === 0) return;
    const pending = results.splice(0, results.length);
    const startedAt = Date.now();
    // TypeORM's JSON DeepPartial type rejects Record<string, unknown> even
    // though it is the entity's declared JSON boundary; keep this cast local
    // to the batch writer rather than weakening the entity contract.
    try {
      await this.resultRepository.insert(
        pending.map((result) => ({
          backtestRunId: result.backtestRunId,
          securityCode: result.securityCode,
          signalTime: result.signalTime,
          contextSnapshot: result.contextSnapshot,
          ruleSnapshot: result.ruleSnapshot,
        })) as never,
      );
      this.health.recordResultBatch(pending.length, Date.now() - startedAt);
    } catch (error) {
      this.health.recordResultBatchFailure(Date.now() - startedAt);
      this.logger.error(
        `backtest persistence_batch_failed runId=${pending[0]?.backtestRunId}`,
      );
      throw error;
    }
  }

  private async failAndCleanup(
    runId: number,
    failure: BacktestRunFailure,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const update = {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: failure.code,
          ...(failure.targetIssues
            ? { targetIssues: uniqueIssues(failure.targetIssues) }
            : {}),
        };
        const updated = await manager.update(
          BacktestRun,
          {
            id: runId,
            status: In([BacktestRunStatus.PENDING, BacktestRunStatus.RUNNING]),
          },
          update,
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

function replayStartFor(run: BacktestRun, plan: ReplayPlan): Date {
  if (
    run.period >= 1_440 ||
    (plan.kind === 'rule_dsl' &&
      !plan.plan.fields.some(
        (field) => field === 'k.volume' || field === 'k.amount',
      ))
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
