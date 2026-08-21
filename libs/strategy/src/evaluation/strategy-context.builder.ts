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
import type { ProjectedStrategyBar } from '../projection/strategy-series-imputer';
import type { StrategyBar } from '../market-data/strategy-bar';
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
  analysis = new StrategyAnalysisObservationCache(),
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

/** Per-group, per-anchor cache. Never retain this object across another bar. */
export class StrategyAnalysisObservationCache {
  private kdjCurrent?: StrategyKdjObservation | null;
  private kdjPrevious?: StrategyKdjObservation | null;
  private macdCurrent?: StrategyMacdObservation | null;
  private macdPrevious?: StrategyMacdObservation | null;

  constructor(
    private readonly calculateKdj = calculateStrategyKdj,
    private readonly calculateMacd = calculateStrategyMacd,
  ) {}

  kdj(
    bars: readonly ProjectedStrategyBar[],
    previous: boolean,
  ): StrategyKdjObservation | null {
    if (previous) {
      this.kdjPrevious ??= this.calculateEffectiveKdj(
        bars.slice(-(STRATEGY_KDJ_CALCULATION_BAR_COUNT + 1), -1),
      );
      return this.kdjPrevious;
    }
    this.kdjCurrent ??= this.calculateEffectiveKdj(
      bars.slice(-STRATEGY_KDJ_CALCULATION_BAR_COUNT),
    );
    return this.kdjCurrent;
  }

  macd(
    bars: readonly ProjectedStrategyBar[],
    previous: boolean,
  ): StrategyMacdObservation | null {
    if (previous) {
      this.macdPrevious ??= this.calculateEffectiveMacd(
        bars.slice(-(STRATEGY_MACD_CALCULATION_BAR_COUNT + 1), -1),
      );
      return this.macdPrevious;
    }
    this.macdCurrent ??= this.calculateEffectiveMacd(
      bars.slice(-STRATEGY_MACD_CALCULATION_BAR_COUNT),
    );
    return this.macdCurrent;
  }

  private calculateEffectiveKdj(
    bars: readonly ProjectedStrategyBar[],
  ): StrategyKdjObservation | null {
    const effective = effectiveBars(bars);
    if (effective === null) return null;
    return this.calculateKdj(effective);
  }

  private calculateEffectiveMacd(
    bars: readonly ProjectedStrategyBar[],
  ): StrategyMacdObservation | null {
    const effective = effectiveBars(bars);
    if (effective === null) return null;
    return this.calculateMacd(effective);
  }
}

function materializeField(
  demand: FieldDemand,
  bars: readonly ProjectedStrategyBar[],
  analysis: StrategyAnalysisObservationCache,
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
      const currentEffective = current.ohlc.effective?.[property] ?? null;
      if (currentEffective === null) return null;
      const previousEffective = demand.needsPrevious
        ? (previous?.ohlc.effective?.[property] ?? null)
        : undefined;
      if (demand.needsPrevious && previousEffective === null) return null;
      return observation(
        currentEffective,
        previousEffective ?? undefined,
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
      const currentValue = analysis.kdj(bars, false);
      if (currentValue === null) return null;
      const previousValue = demand.needsPrevious
        ? analysis.kdj(bars, true)
        : undefined;
      if (demand.needsPrevious && previousValue === null) return null;
      return observation(
        currentValue[property],
        previousValue?.[property],
        demand.needsPrevious,
      );
    }
    case 'indicator.macd.line':
    case 'indicator.macd.signal':
    case 'indicator.macd.histogram': {
      const property = demand.field.slice('indicator.macd.'.length) as
        | 'line'
        | 'signal'
        | 'histogram';
      const currentValue = analysis.macd(bars, false);
      if (currentValue === null) return null;
      const previousValue = demand.needsPrevious
        ? analysis.macd(bars, true)
        : undefined;
      if (demand.needsPrevious && previousValue === null) return null;
      return observation(
        currentValue[property],
        previousValue?.[property],
        demand.needsPrevious,
      );
    }
  }
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

/**
 * Map projected bars to raw-shaped bars carrying the effective OHLC values.
 * Returns null when any bar in the window has no effective OHLC (unavailable):
 * the analysis cannot be computed and the consuming field reports
 * `field_unavailable` instead of tripping the analysis guard on non-finite values.
 */
function effectiveBars(
  bars: readonly ProjectedStrategyBar[],
): StrategyBar[] | null {
  const effective: StrategyBar[] = [];
  for (const projected of bars) {
    const ohlc = projected.ohlc.effective;
    if (ohlc === null) return null;
    effective.push({
      ...projected.rawBar,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
    });
  }
  return effective;
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
