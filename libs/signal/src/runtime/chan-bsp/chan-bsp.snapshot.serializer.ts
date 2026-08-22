import type { ChanBspEvent } from './chan-bsp.types';

/**
 * Shared persistence shape for a confirmed Chan buy/sell point event.
 *
 * Owned by the chan_bsp domain; consumed by realtime candidates
 * (`ShadowStrategyCandidate.contextSnapshot`) and backtest results
 * (`BacktestSignalResult.context_snapshot`) so both sides persist the exact
 * same structural context. Field semantics follow the
 * `add-chan-bsp-realtime-evaluation` delta specs.
 */
export interface ChanBspContextSnapshot {
  readonly chanBsp: Readonly<{
    readonly type: ChanBspEvent['type'];
    readonly units: ChanBspEvent['units'];
    readonly level: number;
    readonly zhongshuIndex: number | null;
    readonly zg: number | null;
    readonly zd: number | null;
  }>;
}

/**
 * Shape-compatible with `serializeStrategyContextSnapshot`'s
 * `Readonly<Record<string, unknown>>` contract (snapshot columns in both
 * realtime and backtest persistence are JSON records).
 */
export function serializeChanBspContextSnapshot(
  event: ChanBspEvent,
  level: number,
): Readonly<Record<string, unknown>> {
  const chanBsp: ChanBspContextSnapshot['chanBsp'] = {
    type: event.type,
    units: event.units,
    level,
    zhongshuIndex: event.zhongshuIndex,
    zg: event.zg,
    zd: event.zd,
  };
  return Object.freeze({
    chanBsp: Object.freeze(chanBsp),
  });
}
