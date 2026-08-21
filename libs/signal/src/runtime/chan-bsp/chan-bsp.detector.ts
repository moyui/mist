import type { ProjectedStrategyBar } from '@app/strategy';
import { runChanBspPipeline } from './chan-bsp.pipeline';
import { toChanKSeries } from './chan-bsp.k-mapper';
import type {
  ChanBspEvent,
  ChanBspEventType,
  ChanBspPlan,
} from './chan-bsp.types';

/**
 * Stateless Chan buy/sell point detector over one projected evaluation window.
 *
 * `evaluate` returns ALL confirmed points in the window filtered by the plan's
 * point selection and direction. It is deterministic and holds no state —
 * incremental emission (which points are new) is the evaluation layer's
 * responsibility (ChanBspEpisodeCursor). A window shorter than the plan's
 * budget or a structure that confirms nothing yields `[]` (not an error).
 */
export class ChanBspDetector {
  evaluate(
    window: readonly ProjectedStrategyBar[],
    plan: ChanBspPlan,
  ): readonly ChanBspEvent[] {
    if (window.length < plan.requiredBarCount) return Object.freeze([]);
    const events = runChanBspPipeline({
      klines: toChanKSeries(window),
      units: plan.units,
    });
    return Object.freeze(events.filter((event) => matchesPlan(event, plan)));
  }
}

function matchesPlan(event: ChanBspEvent, plan: ChanBspPlan): boolean {
  if (!pointsEnabled(plan, event.type)) return false;
  if (plan.direction === 'both') return true;
  const isBuy = event.type.endsWith('_buy');
  return plan.direction === 'buy' ? isBuy : !isBuy;
}

function pointsEnabled(plan: ChanBspPlan, type: ChanBspEventType): boolean {
  switch (type) {
    case 'first_buy':
    case 'first_sell':
      return plan.points.first;
    case 'second_buy':
    case 'second_sell':
      return plan.points.second;
    case 'third_buy':
    case 'third_sell':
      return plan.points.third;
  }
}

/** Exported for unit testing: does one event pass the plan's filter? */
export function matchesChanBspPlan(
  event: ChanBspEvent,
  plan: ChanBspPlan,
): boolean {
  return matchesPlan(event, plan);
}
