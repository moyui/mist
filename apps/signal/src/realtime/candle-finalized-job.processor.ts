import type {
  StrategyBar,
  StrategyRealtimeMarketDataPort,
} from '@app/strategy';
import {
  CANDLE_FINALIZED_JOB_NAME,
  STRATEGY_TRIGGER_JOB_TIMEOUT_MS,
  RealtimePeriodBuilder,
  RealtimeStrategyEvaluationService,
  decodeCandleFinalizedTriggerV1,
  toStrategyTrigger,
  type RealtimeStrategyExecutionPlan,
  type ShadowStrategyCandidate,
} from '@app/signal';
import type { SignalRegistrySnapshot } from '../signal-registry.types';
import type {
  LiveStrategyPersistenceOutcome,
  LiveStrategyPersistenceService,
} from './live-strategy-persistence.service';

export type CandleFinalizedJobOutcome =
  | 'completed'
  | 'expired_trading_day'
  | 'out_of_order_trigger_discarded';

export interface CandleFinalizedJobResult {
  readonly outcome: CandleFinalizedJobOutcome;
  readonly candidates: readonly ShadowStrategyCandidate[];
}

export class RealtimeStrategyJobDeadlineExceededError extends Error {
  readonly code = 'REALTIME_STRATEGY_JOB_DEADLINE_EXCEEDED';

  constructor(readonly stage: string) {
    super(`realtime strategy job deadline exceeded at ${stage}`);
    this.name = 'RealtimeStrategyJobDeadlineExceededError';
  }
}

interface FinalizationCursor {
  readonly timestampMs: number;
  readonly outcome: 'sealed' | 'discarded';
  readonly bar: StrategyBar | null;
}

export class CandleFinalizedJobProcessor {
  private readonly cursors = new Map<string, FinalizationCursor>();
  private activeTradingDay: string | null = null;

  constructor(
    private readonly marketData: StrategyRealtimeMarketDataPort,
    private readonly executionPlans: (
      securityId: number,
      source: 'tdx' | 'qmt',
    ) => readonly RealtimeStrategyExecutionPlan[],
    private readonly now: () => Date,
    private readonly periodBuilder = new RealtimePeriodBuilder(),
    private readonly evaluation = new RealtimeStrategyEvaluationService(
      marketData,
    ),
    private readonly jobTimeoutMs = STRATEGY_TRIGGER_JOB_TIMEOUT_MS,
    private readonly mode: 'shadow' | 'on' = 'shadow',
    private readonly persistence?: Pick<LiveStrategyPersistenceService, 'persist'>,
  ) {}

  async process(
    jobName: string,
    data: unknown,
  ): Promise<CandleFinalizedJobResult> {
    const deadlineAt = this.now().getTime() + this.jobTimeoutMs;
    if (jobName !== CANDLE_FINALIZED_JOB_NAME) {
      throw new TypeError(`unsupported strategy trigger job: ${jobName}`);
    }
    const payload = decodeCandleFinalizedTriggerV1(data);
    const trigger = toStrategyTrigger(payload);
    this.assertWithinDeadline(deadlineAt, 'trading_day_validation:before');
    const tradingDay = shanghaiDay(trigger.timestamp);
    const currentDay = shanghaiDay(this.now());
    if (tradingDay < currentDay) {
      return completed('expired_trading_day');
    }
    if (tradingDay > currentDay) {
      throw new RangeError('candle_finalized triggerTime is in the future day');
    }
    this.assertWithinDeadline(deadlineAt, 'trading_day_validation:after');
    if (this.activeTradingDay !== tradingDay) {
      this.activeTradingDay = tradingDay;
      this.cursors.clear();
      this.periodBuilder.reset();
      this.evaluation.reset();
    }
    const executionPlans = this.executionPlans(
      trigger.securityId,
      trigger.source,
    );

    const cursorKey = `${trigger.securityId}\u0000${trigger.source}`;
    const triggerMs = trigger.timestamp.getTime();
    const prior = this.cursors.get(cursorKey);
    if (prior && triggerMs < prior.timestampMs) {
      return completed('out_of_order_trigger_discarded');
    }

    const sealedBar =
      payload.outcome === 'sealed'
        ? await this.runStage(deadlineAt, 'redis_observation', () =>
            this.resolveSealed(trigger, payload.triggerPrice),
          )
        : null;
    if (prior && triggerMs === prior.timestampMs) {
      if (
        prior.outcome === trigger.outcome &&
        (sealedBar === null
          ? prior.bar === null
          : prior.bar !== null && sameBar(prior.bar, sealedBar))
      ) {
        return Object.freeze({
          outcome: 'completed',
          candidates: Object.freeze([]),
        });
      }
      throw new Error('conflicting candle finalization identity');
    }
    const emitted = this.periodBuilder.accept(
      trigger,
      sealedBar,
      new Set(executionPlans.map((plan) => plan.period)),
    );
    this.cursors.set(cursorKey, {
      timestampMs: triggerMs,
      outcome: trigger.outcome,
      bar: sealedBar,
    });

    const candidates: ShadowStrategyCandidate[] = [];
    for (const bar of emitted) {
      const evaluated = await this.runStage(
        deadlineAt,
        'analysis_evaluation',
        () => this.evaluation.evaluate(bar, executionPlans),
      );
      for (const candidate of evaluated) {
        if (this.mode === 'on') {
          if (!this.persistence) {
            throw new Error('on-mode live strategy persistence is unavailable');
          }
          await this.runStage(
            deadlineAt,
            'persistence',
            async (): Promise<LiveStrategyPersistenceOutcome> =>
              this.persistence!.persist(candidate),
          );
        }
        this.evaluation.activate(candidate);
        candidates.push(candidate);
      }
    }
    return Object.freeze({
      outcome: 'completed',
      candidates: Object.freeze(candidates),
    });
  }

  private async runStage<T>(
    deadlineAt: number,
    stage: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.assertWithinDeadline(deadlineAt, `${stage}:before`);
    const result = await operation();
    this.assertWithinDeadline(deadlineAt, `${stage}:after`);
    return result;
  }

  private assertWithinDeadline(deadlineAt: number, stage: string): void {
    if (this.now().getTime() >= deadlineAt) {
      throw new RealtimeStrategyJobDeadlineExceededError(stage);
    }
  }

  private async resolveSealed(
    trigger: ReturnType<typeof toStrategyTrigger>,
    triggerPrice: number,
  ) {
    const observation =
      await this.marketData.resolveRealtimeObservation(trigger);
    if (observation.outcome !== 'sealed') {
      throw new TypeError('sealed trigger resolved to a discarded observation');
    }
    if (observation.bar.close !== triggerPrice) {
      throw new Error('sealed trigger price conflicts with Redis candle close');
    }
    return observation.bar;
  }

  reconcileRegistry(snapshot: SignalRegistrySnapshot): void {
    const groups: Array<{
      securityId: number;
      source: 'tdx' | 'qmt';
      period: number;
    }> = [];
    const episodes: Array<{
      definitionId: number;
      versionId: number;
      securityId: number;
      source: 'tdx' | 'qmt';
      period: number;
      signalKind: 'entry' | 'exit';
    }> = [];
    for (const definition of snapshot.definitions.values()) {
      for (const source of definition.sources) {
        if (source !== 'tdx' && source !== 'qmt') continue;
        for (const securityId of definition.securityIds) {
          for (const period of definition.periods) {
            if (![1, 5, 15, 30, 60].includes(period)) continue;
            groups.push({ securityId, source, period });
            episodes.push({
              definitionId: definition.definitionId,
              versionId: definition.versionId,
              securityId,
              source,
              period,
              signalKind: definition.signalKind,
            });
          }
        }
      }
    }
    this.periodBuilder.retainGroups(groups);
    this.evaluation.retainRegistryScopes(groups, episodes);
    const retainedSeries = new Set(
      groups.map((group) => `${group.securityId}\u0000${group.source}`),
    );
    for (const key of this.cursors.keys()) {
      if (!retainedSeries.has(key)) this.cursors.delete(key);
    }
  }
}

function sameBar(left: StrategyBar, right: StrategyBar): boolean {
  return (
    left.securityId === right.securityId &&
    left.source === right.source &&
    left.period === right.period &&
    left.timestamp.getTime() === right.timestamp.getTime() &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.amount === right.amount &&
    left.type === right.type
  );
}

function completed(outcome: Exclude<CandleFinalizedJobOutcome, 'completed'>) {
  return Object.freeze({ outcome, candidates: Object.freeze([]) });
}

function shanghaiDay(timestamp: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}
