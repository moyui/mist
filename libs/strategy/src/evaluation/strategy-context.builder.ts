import {
  STRATEGY_KDJ_CALCULATION_BAR_COUNT,
  calculateStrategyKdj,
  type StrategyKdjObservation,
} from '../analysis/strategy-kdj';
import {
  STRATEGY_MACD_CALCULATION_BAR_COUNT,
  calculateStrategyMacd,
  type StrategyMacdObservation,
} from '../analysis/strategy-macd';
import type { ProjectedStrategyBar } from '../projection/quantity-forward-fill.projector';
import type { StrategyFieldPath } from '../rules/strategy-field.catalog';
import type {
  CompiledStrategyCondition,
  CompiledStrategyExecutionPlan,
  CompiledStrategyExpression,
} from '../rules/strategy-rule.types';
import type {
  StrategyEvaluationContext,
  StrategyFieldObservation,
  StrategyQuantityEvidence,
  StrategyQuantityEvidenceItem,
  StrategyUnavailableReason,
} from './strategy-evaluation.types';

export type StrategyContextBuildResult =
  | {
      readonly status: 'unavailable';
      readonly reason: StrategyUnavailableReason;
    }
  | {
      readonly status: 'ready';
      readonly context: StrategyEvaluationContext;
    };

interface FieldDemand {
  readonly field: StrategyFieldPath;
  needsPrevious: boolean;
}

export function buildStrategyEvaluationContext(
  plan: CompiledStrategyExecutionPlan,
  projectedBars: readonly ProjectedStrategyBar[],
): StrategyContextBuildResult {
  if (projectedBars.length < plan.requiredBarCount) {
    return Object.freeze({
      status: 'unavailable',
      reason: 'insufficient_history',
    });
  }

  const bars = projectedBars.slice(-plan.requiredBarCount);
  assertOrderedMarketGroup(bars);
  const demands = collectFieldDemands(plan.root);
  const fields: Partial<Record<StrategyFieldPath, StrategyFieldObservation>> =
    {};
  const quantityCurrent: MutableQuantityEvidenceObservation = {};
  const quantityPrevious: MutableQuantityEvidenceObservation = {};
  let hasQuantity = false;
  let hasPreviousQuantity = false;
  const analysis: AnalysisObservationCache = {};

  for (const demand of demands.values()) {
    const observation = materializeField(demand, bars, analysis);
    if (!observation) {
      return Object.freeze({
        status: 'unavailable',
        reason: 'field_unavailable',
      });
    }
    fields[demand.field] = observation.values;
    if (observation.quantityCurrent) {
      hasQuantity = true;
      setQuantityEvidence(
        quantityCurrent,
        demand.field,
        observation.quantityCurrent,
      );
    }
    if (observation.quantityPrevious) {
      hasPreviousQuantity = true;
      setQuantityEvidence(
        quantityPrevious,
        demand.field,
        observation.quantityPrevious,
      );
    }
  }

  const quantityEvidence = hasQuantity
    ? Object.freeze({
        current: Object.freeze(quantityCurrent),
        ...(hasPreviousQuantity
          ? { previous: Object.freeze(quantityPrevious) }
          : {}),
      } satisfies StrategyQuantityEvidence)
    : undefined;
  const anchor = bars.at(-1);
  if (!anchor) {
    throw new Error('compiled strategy context has no anchor bar');
  }

  return Object.freeze({
    status: 'ready',
    context: Object.freeze({
      anchor,
      barType: anchor.rawBar.type,
      fields: Object.freeze(fields),
      ...(quantityEvidence ? { quantityEvidence } : {}),
    }),
  });
}

type MutableQuantityEvidenceObservation = {
  volume?: StrategyQuantityEvidenceItem;
  amount?: StrategyQuantityEvidenceItem;
};

interface MaterializedField {
  readonly values: StrategyFieldObservation;
  readonly quantityCurrent?: StrategyQuantityEvidenceItem;
  readonly quantityPrevious?: StrategyQuantityEvidenceItem;
}

interface AnalysisObservationCache {
  kdjCurrent?: StrategyKdjObservation;
  kdjPrevious?: StrategyKdjObservation;
  macdCurrent?: StrategyMacdObservation;
  macdPrevious?: StrategyMacdObservation;
}

function materializeField(
  demand: FieldDemand,
  bars: readonly ProjectedStrategyBar[],
  analysis: AnalysisObservationCache,
): MaterializedField | null {
  const current = bars.at(-1);
  if (!current) return null;
  const previous = demand.needsPrevious ? bars.at(-2) : undefined;

  switch (demand.field) {
    case 'k.open':
    case 'k.high':
    case 'k.low':
    case 'k.close': {
      const property = demand.field.slice(2) as
        | 'open'
        | 'high'
        | 'low'
        | 'close';
      return observation(
        current.rawBar[property],
        previous?.rawBar[property],
        demand.needsPrevious,
      );
    }
    case 'k.type':
      return observation(
        current.rawBar.type,
        previous?.rawBar.type,
        demand.needsPrevious,
      );
    case 'k.volume':
    case 'k.amount': {
      const property = demand.field.slice(2) as 'volume' | 'amount';
      const currentEvidence = quantityEvidence(current[property]);
      const previousEvidence = previous
        ? quantityEvidence(previous[property])
        : undefined;
      if (!currentEvidence || (demand.needsPrevious && !previousEvidence)) {
        return null;
      }
      return {
        values: Object.freeze({
          current: currentEvidence.effective,
          ...(previousEvidence ? { previous: previousEvidence.effective } : {}),
        }),
        quantityCurrent: currentEvidence,
        ...(previousEvidence ? { quantityPrevious: previousEvidence } : {}),
      };
    }
    case 'indicator.kdj.k':
    case 'indicator.kdj.d':
    case 'indicator.kdj.j': {
      const property = demand.field.slice(-1) as 'k' | 'd' | 'j';
      const currentValue = kdjObservation(analysis, bars, false)[property];
      const previousValue = demand.needsPrevious
        ? kdjObservation(analysis, bars, true)[property]
        : undefined;
      return observation(currentValue, previousValue, demand.needsPrevious);
    }
    case 'indicator.macd.line':
    case 'indicator.macd.signal':
    case 'indicator.macd.histogram': {
      const property = demand.field.slice('indicator.macd.'.length) as
        | 'line'
        | 'signal'
        | 'histogram';
      const currentValue = macdObservation(analysis, bars, false)[property];
      const previousValue = demand.needsPrevious
        ? macdObservation(analysis, bars, true)[property]
        : undefined;
      return observation(currentValue, previousValue, demand.needsPrevious);
    }
  }
}

function kdjObservation(
  analysis: AnalysisObservationCache,
  bars: readonly ProjectedStrategyBar[],
  previous: boolean,
): StrategyKdjObservation {
  if (previous) {
    analysis.kdjPrevious ??= calculateStrategyKdj(
      rawBars(bars.slice(-(STRATEGY_KDJ_CALCULATION_BAR_COUNT + 1), -1)),
    );
    return analysis.kdjPrevious;
  }
  analysis.kdjCurrent ??= calculateStrategyKdj(
    rawBars(bars.slice(-STRATEGY_KDJ_CALCULATION_BAR_COUNT)),
  );
  return analysis.kdjCurrent;
}

function macdObservation(
  analysis: AnalysisObservationCache,
  bars: readonly ProjectedStrategyBar[],
  previous: boolean,
): StrategyMacdObservation {
  if (previous) {
    analysis.macdPrevious ??= calculateStrategyMacd(
      rawBars(bars.slice(-(STRATEGY_MACD_CALCULATION_BAR_COUNT + 1), -1)),
    );
    return analysis.macdPrevious;
  }
  analysis.macdCurrent ??= calculateStrategyMacd(
    rawBars(bars.slice(-STRATEGY_MACD_CALCULATION_BAR_COUNT)),
  );
  return analysis.macdCurrent;
}

function observation(
  current: number | string,
  previous: number | string | undefined,
  needsPrevious: boolean,
): MaterializedField | null {
  if (needsPrevious && previous === undefined) return null;
  return {
    values: Object.freeze({
      current,
      ...(previous === undefined ? {} : { previous }),
    }),
  };
}

function quantityEvidence(
  projected: ProjectedStrategyBar['volume'],
): StrategyQuantityEvidenceItem | null {
  if (projected.effective === null || projected.resolution === 'unavailable') {
    return null;
  }
  return Object.freeze({
    raw: projected.raw,
    effective: projected.effective,
    resolution: projected.resolution,
  });
}

function collectFieldDemands(
  root: CompiledStrategyExpression,
): Map<StrategyFieldPath, FieldDemand> {
  const demands = new Map<StrategyFieldPath, FieldDemand>();
  const visit = (node: CompiledStrategyExpression): void => {
    if (node.kind === 'condition') {
      const needsPrevious = isCrossover(node);
      const existing = demands.get(node.field);
      if (!existing) {
        demands.set(node.field, { field: node.field, needsPrevious });
      } else if (needsPrevious) {
        existing.needsPrevious = true;
      }
      return;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return demands;
}

function isCrossover(condition: CompiledStrategyCondition): boolean {
  return (
    condition.operator === 'crossesAbove' ||
    condition.operator === 'crossesBelow'
  );
}

function setQuantityEvidence(
  target: MutableQuantityEvidenceObservation,
  field: StrategyFieldPath,
  evidence: StrategyQuantityEvidenceItem,
): void {
  if (field === 'k.volume') target.volume = evidence;
  if (field === 'k.amount') target.amount = evidence;
}

function rawBars(bars: readonly ProjectedStrategyBar[]) {
  return bars.map((bar) => bar.rawBar);
}

function assertOrderedMarketGroup(bars: readonly ProjectedStrategyBar[]): void {
  const first = bars[0];
  if (!first) return;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    if (
      bar.rawBar.securityId !== first.rawBar.securityId ||
      bar.rawBar.source !== first.rawBar.source ||
      bar.rawBar.period !== first.rawBar.period
    ) {
      throw new TypeError(
        'strategy context bars must share one market identity',
      );
    }
    const timestamp = bar.rawBar.timestamp.getTime();
    if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp) {
      throw new TypeError(
        'strategy context bars must have strictly increasing timestamps',
      );
    }
    previousTimestamp = timestamp;
  }
}
