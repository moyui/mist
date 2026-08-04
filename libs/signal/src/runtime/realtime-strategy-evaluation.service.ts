import {
  evaluateStrategyPlan,
  type CompiledStrategyExecutionPlan,
  type StrategyBar,
  type StrategyEvaluationOutcome,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeSource,
} from '@app/strategy';
import {
  RealtimeEpisodeStore,
  type RealtimeEpisodeIdentity,
} from './realtime-episode.store';
import { SharedStrategyWindowStore } from './shared-strategy-window.store';

export interface RealtimeStrategyExecutionPlan {
  readonly definitionId: number;
  readonly versionId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly plan: CompiledStrategyExecutionPlan;
}

export interface ShadowStrategyCandidate {
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly signalKind: 'entry' | 'exit';
  readonly signalTime: Date;
  readonly triggerTime: string;
  readonly triggerPrice: number;
  readonly barType: StrategyBar['type'];
  readonly evaluation: Extract<
    StrategyEvaluationOutcome,
    { status: 'evaluated' }
  >;
}

export class RealtimeStrategyEvaluationService {
  constructor(
    private readonly marketData: StrategyRealtimeMarketDataPort,
    private readonly windows = new SharedStrategyWindowStore(),
    private readonly episodes = new RealtimeEpisodeStore(),
  ) {}

  async evaluate(
    bar: StrategyBar,
    plans: readonly RealtimeStrategyExecutionPlan[],
  ): Promise<readonly ShadowStrategyCandidate[]> {
    const eligible = plans
      .filter(
        (candidate) =>
          candidate.source === bar.source && candidate.period === bar.period,
      )
      .sort(
        (left, right) =>
          left.definitionId - right.definitionId ||
          left.versionId - right.versionId,
      );
    if (eligible.length === 0) return Object.freeze([]);

    const requiredBars = Math.max(
      ...eligible.map((candidate) => candidate.plan.requiredBarCount),
    );
    const append = await this.windows.prepare(
      this.marketData,
      bar,
      requiredBars,
    );
    if (append === 'duplicate') return Object.freeze([]);

    const projected = this.windows.read(
      bar.securityId,
      requireRealtimeSource(bar.source),
      bar.period,
    );
    const candidates: ShadowStrategyCandidate[] = [];
    for (const execution of eligible) {
      const outcome = evaluateStrategyPlan(execution.plan, projected);
      const identity: RealtimeEpisodeIdentity = {
        definitionId: execution.definitionId,
        versionId: execution.versionId,
        securityId: bar.securityId,
        source: execution.source,
        period: execution.period,
        signalKind: execution.plan.signalKind,
      };
      const decision = this.episodes.decide(identity, outcome);
      if (decision !== 'emit' || outcome.status !== 'evaluated') continue;
      const candidate = Object.freeze({
        definitionId: execution.definitionId,
        versionId: execution.versionId,
        securityId: bar.securityId,
        source: execution.source,
        period: execution.period,
        signalKind: execution.plan.signalKind,
        signalTime: bar.timestamp,
        triggerTime: bar.timestamp.toISOString(),
        triggerPrice: bar.close,
        barType: bar.type,
        evaluation: outcome,
      });
      candidates.push(candidate);
      this.episodes.activate(identity);
    }
    return Object.freeze(candidates);
  }

  reset(): void {
    this.windows.reset();
    this.episodes.reset();
  }
}

function requireRealtimeSource(
  source: StrategyBar['source'],
): StrategyRealtimeSource {
  if (source !== 'tdx' && source !== 'qmt') {
    throw new TypeError('shadow evaluation source must be tdx or qmt');
  }
  return source;
}
