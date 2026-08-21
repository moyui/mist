import type { ChanBspUnitLevel } from '../chan-bsp-plan';
export type { ChanBspPlan } from '../chan-bsp-plan';

/**
 * Chan buy/sell point (缠论三类买卖点) realtime strategy kind.
 *
 * `ChanBspPlan` (the compiled strategy contract) is owned by `@app/signal`;
 * this file carries the detector-level types and the window budget the
 * registry uses to compile a chan_bsp rule. The detector is a stateless
 * window → events pure function. See add-chan-bsp-realtime-evaluation spec.
 */

/** Realtime levels supported for chan_bsp evaluation (day-level deferred). */
export const REALTIME_CHAN_BSP_LEVELS: readonly number[] = [1, 5, 15, 30, 60];

/**
 * Internal window budget per level: the number of bars the engine loads so the
 * Chan structure (trend chains of two or more same-direction channels) can
 * form. This is a data budget, NOT a decision threshold — whether any point is
 * confirmed is decided entirely by the Chan structure.
 */
export const CHAN_BSP_WINDOW_BUDGET: Readonly<
  Record<(typeof REALTIME_CHAN_BSP_LEVELS)[number], number>
> = {
  1: 800,
  5: 500,
  15: 300,
  30: 200,
  60: 120,
};

export type ChanBspEventType =
  | 'first_buy'
  | 'first_sell'
  | 'second_buy'
  | 'second_sell'
  | 'third_buy'
  | 'third_sell';

/**
 * One confirmed Chan buy/sell point within an evaluation window.
 * - time: confirmation time = end of the confirming unit (unitIndex).
 * - price: confirming unit's low (buy) / high (sell).
 * - zhongshuIndex/zg/zd: related channel when the point is channel-bound
 *   (first/third type); null for second-type points (structural, not
 *   channel-bound).
 * - unitIndex: confirming unit index — the monotonic cursor input.
 */
export interface ChanBspEvent {
  readonly type: ChanBspEventType;
  readonly units: ChanBspUnitLevel;
  readonly time: Date;
  readonly price: number;
  readonly zhongshuIndex: number | null;
  readonly zg: number | null;
  readonly zd: number | null;
  readonly unitIndex: number;
}
