import {
  evaluateStrategyPlan,
  serializeStrategyContextSnapshot,
  StrategyAnalysisObservationCache,
  type CompiledStrategyExecutionPlan,
  type StrategyEvaluationOutcome,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeSource,
} from '@app/strategy';
import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import {
  RealtimeEpisodeStore,
  type RealtimeEpisodeIdentity,
} from './realtime-episode.store';
import { SharedStrategyWindowStore } from './shared-strategy-window.store';
import type { RealtimeWindowGroupIdentity } from './shared-strategy-window.store';
import { ChanBspDetector } from './chan-bsp/chan-bsp.detector';
import {
  ChanBspEpisodeCursor,
  chanBspIdentityKey,
  type ChanBspEpisodeIdentity,
} from './chan-bsp/chan-bsp.episode';
import type { ChanBspEvent, ChanBspPlan } from './chan-bsp/chan-bsp.types';
import { serializeChanBspContextSnapshot } from './chan-bsp/chan-bsp.snapshot.serializer';

export type RealtimeStrategyExecutionPlan = {
  readonly definitionId: number;
  readonly versionId: number;
  readonly source: StrategyRealtimeSource;
  readonly period: number;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
} & (
  | {
      readonly kind: 'rule_dsl';
      readonly plan: CompiledStrategyExecutionPlan;
    }
  | {
      readonly kind: 'chan_bsp';
      readonly plan: ChanBspPlan;
    }
);

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
  readonly contextSnapshot: Readonly<Record<string, unknown>>;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export class RealtimeStrategyEvaluationService {
  private lastOutcome:
    | 'evaluated_matched'
    | 'evaluated_not_matched'
    | 'unavailable'
    | null = null;
  constructor(
    private readonly marketData: StrategyRealtimeMarketDataPort,
    private readonly windows = new SharedStrategyWindowStore(),
    private readonly episodes = new RealtimeEpisodeStore(),
    private readonly chanBspDetector = new ChanBspDetector(),
    private readonly chanBspCursors = new ChanBspEpisodeCursor(),
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
    const analysis = new StrategyAnalysisObservationCache();
    for (const execution of eligible) {
      if (execution.kind === 'chan_bsp') {
        this.evaluateChanBsp(execution, bar, projected, candidates);
        continue;
      }
      const outcome = evaluateStrategyPlan(execution.plan, projected, analysis);
      this.lastOutcome =
        outcome.status === 'unavailable'
          ? 'unavailable'
          : outcome.matched
            ? 'evaluated_matched'
            : 'evaluated_not_matched';
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
        contextSnapshot: serializeStrategyContextSnapshot(
          execution.plan,
          outcome.context,
        ),
        ruleSnapshot: execution.ruleSnapshot,
      });
      candidates.push(candidate);
    }
    return Object.freeze(candidates);
  }

  private evaluateChanBsp(
    execution: Extract<RealtimeStrategyExecutionPlan, { kind: 'chan_bsp' }>,
    bar: StrategyBar,
    projected: readonly ProjectedStrategyBar[],
    out: ShadowStrategyCandidate[],
  ): void {
    const events = this.chanBspDetector.evaluate(projected, execution.plan);
    const identity: ChanBspEpisodeIdentity = {
      definitionId: execution.definitionId,
      securityId: bar.securityId,
      source: execution.source,
      level: bar.period,
      units: execution.plan.units,
    };
    const fresh = this.chanBspCursors.advance(identity, events);
    for (const event of fresh) {
      this.lastOutcome = 'evaluated_matched';
      const anchor = projected.at(-1);
      if (!anchor) continue;
      const candidate = Object.freeze({
        definitionId: execution.definitionId,
        versionId: execution.versionId,
        securityId: bar.securityId,
        source: execution.source,
        period: bar.period,
        signalKind: chanBspSignalKind(event),
        signalTime: event.time,
        triggerTime: event.time.toISOString(),
        triggerPrice: event.price,
        barType: bar.type,
        evaluation: Object.freeze({
          status: 'evaluated',
          matched: true,
          context: Object.freeze({
            anchor,
            barType: bar.type,
            fields: Object.freeze({}),
          }),
        }),
        contextSnapshot: serializeChanBspContextSnapshot(event, bar.period),
        ruleSnapshot: execution.ruleSnapshot,
      });
      out.push(candidate);
    }
  }

  activate(candidate: ShadowStrategyCandidate): void {
    this.episodes.activate(candidate);
  }

  reset(): void {
    this.windows.reset();
    this.episodes.reset();
    this.chanBspCursors.reset();
    this.lastOutcome = null;
  }

  diagnostics() {
    return Object.freeze({
      ...this.windows.diagnostics(),
      activeEpisodeCount: this.episodes.activeCount,
      activeChanBspCursorCount: this.chanBspCursors.activeCount,
      lastOutcome: this.lastOutcome,
    });
  }

  retainRegistryScopes(
    groups: readonly RealtimeWindowGroupIdentity[],
    episodes: readonly RealtimeEpisodeIdentity[],
    chanBspIdentities: readonly ChanBspEpisodeIdentity[],
  ): void {
    this.windows.retainGroups(groups);
    this.episodes.retainIdentities(episodes);
    this.chanBspCursors.retainIdentities(
      new Set(chanBspIdentities.map(chanBspIdentityKey)),
    );
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

function chanBspSignalKind(event: ChanBspEvent): 'entry' | 'exit' {
  return event.type.endsWith('_buy') ? 'entry' : 'exit';
}
