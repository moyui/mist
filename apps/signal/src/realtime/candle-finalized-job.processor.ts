import type {
  StrategyBar,
  StrategyRealtimeMarketDataPort,
} from '@app/strategy';
import {
  CANDLE_FINALIZED_JOB_NAME,
  RealtimePeriodBuilder,
  RealtimeStrategyEvaluationService,
  decodeCandleFinalizedTriggerV1,
  toStrategyTrigger,
  type RealtimeStrategyExecutionPlan,
  type ShadowStrategyCandidate,
} from '@app/signal';

export type CandleFinalizedJobOutcome =
  | 'completed'
  | 'expired_trading_day'
  | 'out_of_order_trigger_discarded';

export interface CandleFinalizedJobResult {
  readonly outcome: CandleFinalizedJobOutcome;
  readonly candidates: readonly ShadowStrategyCandidate[];
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
    private readonly executionPlans: () => readonly RealtimeStrategyExecutionPlan[],
    private readonly now: () => Date,
    private readonly periodBuilder = new RealtimePeriodBuilder(),
    private readonly evaluation = new RealtimeStrategyEvaluationService(
      marketData,
    ),
  ) {}

  async process(
    jobName: string,
    data: unknown,
  ): Promise<CandleFinalizedJobResult> {
    if (jobName !== CANDLE_FINALIZED_JOB_NAME) {
      throw new TypeError(`unsupported strategy trigger job: ${jobName}`);
    }
    const payload = decodeCandleFinalizedTriggerV1(data);
    const trigger = toStrategyTrigger(payload);
    const tradingDay = shanghaiDay(trigger.timestamp);
    const currentDay = shanghaiDay(this.now());
    if (tradingDay < currentDay) {
      return completed('expired_trading_day');
    }
    if (tradingDay > currentDay) {
      throw new RangeError('candle_finalized triggerTime is in the future day');
    }
    if (this.activeTradingDay !== tradingDay) {
      this.activeTradingDay = tradingDay;
      this.cursors.clear();
      this.periodBuilder.reset();
      this.evaluation.reset();
    }

    const cursorKey = `${trigger.securityId}\u0000${trigger.source}`;
    const triggerMs = trigger.timestamp.getTime();
    const prior = this.cursors.get(cursorKey);
    if (prior && triggerMs < prior.timestampMs) {
      return completed('out_of_order_trigger_discarded');
    }

    const sealedBar =
      trigger.outcome === 'sealed' ? await this.resolveSealed(trigger) : null;
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
    const emitted = this.periodBuilder.accept(trigger, sealedBar);
    this.cursors.set(cursorKey, {
      timestampMs: triggerMs,
      outcome: trigger.outcome,
      bar: sealedBar,
    });

    const candidates: ShadowStrategyCandidate[] = [];
    for (const bar of emitted) {
      candidates.push(
        ...(await this.evaluation.evaluate(bar, this.executionPlans())),
      );
    }
    return Object.freeze({
      outcome: 'completed',
      candidates: Object.freeze(candidates),
    });
  }

  private async resolveSealed(trigger: ReturnType<typeof toStrategyTrigger>) {
    const observation =
      await this.marketData.resolveRealtimeObservation(trigger);
    if (observation.outcome !== 'sealed') {
      throw new TypeError('sealed trigger resolved to a discarded observation');
    }
    return observation.bar;
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
