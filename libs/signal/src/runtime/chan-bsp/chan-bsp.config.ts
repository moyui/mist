import type { ChanBspPlan } from '@app/signal';
import {
  CHAN_BSP_WINDOW_BUDGET,
  REALTIME_CHAN_BSP_LEVELS,
} from './chan-bsp.types';

export class ChanBspConfigError extends Error {
  readonly code = 'CHAN_BSP_CONFIG_INVALID';

  constructor(readonly reason: string) {
    super(`chan_bsp strategy config is invalid: ${reason}`);
    this.name = 'ChanBspConfigError';
  }
}

/**
 * Compile a `kind='chan_bsp'` strategy rule into the runtime plan.
 *
 * The rule shape is `{ units, points, direction }`; the evaluation level comes
 * from the definition's `periods` (single value, one of the realtime levels).
 * No minimum-bar setting is accepted — the window budget is internal
 * (CHAN_BSP_WINDOW_BUDGET) and whether any point is confirmed is decided by
 * the Chan structure. Invalid configuration throws (registry rejects the
 * definition under the existing failure semantics).
 */
export function compileChanBspConfig(
  rule: Record<string, unknown>,
  periods: readonly number[],
): ChanBspPlan {
  if (periods.length !== 1) {
    throw new ChanBspConfigError('periods must contain exactly one level');
  }
  const level = periods[0];
  if (!REALTIME_CHAN_BSP_LEVELS.includes(level)) {
    throw new ChanBspConfigError(
      `level ${level} is not a realtime chan_bsp level (1/5/15/30/60)`,
    );
  }

  const units = rule['units'];
  if (units !== 'bi' && units !== 'duan') {
    throw new ChanBspConfigError("units must be 'bi' or 'duan'");
  }
  const direction = rule['direction'];
  if (direction !== 'buy' && direction !== 'sell' && direction !== 'both') {
    throw new ChanBspConfigError("direction must be 'buy', 'sell' or 'both'");
  }
  const points = rule['points'];
  if (typeof points !== 'object' || points === null || Array.isArray(points)) {
    throw new ChanBspConfigError('points must be an object of booleans');
  }
  const selection = points as Record<string, unknown>;
  const enabled =
    selection['first'] === true ||
    selection['second'] === true ||
    selection['third'] === true;
  if (!enabled) {
    throw new ChanBspConfigError(
      'at least one of points.first/second/third must be enabled',
    );
  }

  return Object.freeze({
    units,
    points: Object.freeze({
      first: selection['first'] === true,
      second: selection['second'] === true,
      third: selection['third'] === true,
    }),
    direction,
    requiredBarCount: CHAN_BSP_WINDOW_BUDGET[level as 1 | 5 | 15 | 30 | 60],
  });
}
