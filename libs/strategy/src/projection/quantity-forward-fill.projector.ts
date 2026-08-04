import { Decimal8 } from '@app/decimal';
import type {
  StrategyBar,
  StrategyMarketSource,
} from '../market-data/strategy-bar';

export type StrategyQuantityResolution =
  | 'observed'
  | 'forwardFilled'
  | 'unavailable';

export interface ProjectedStrategyQuantity {
  readonly raw: string | null;
  readonly effective: string | null;
  readonly resolution: StrategyQuantityResolution;
}

export interface ProjectedStrategyBar {
  readonly rawBar: StrategyBar;
  readonly tradingDay: string;
  readonly volume: ProjectedStrategyQuantity;
  readonly amount: ProjectedStrategyQuantity;
}

interface QuantityGroupState {
  tradingDay: string;
  lastTimestampMs: number;
  volume: string | null;
  amount: string | null;
}

const SHANGHAI_TRADING_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Deterministic evaluation-only quantity projection. Raw bars and persistence
 * remain untouched; callers explicitly retain or reset this in-process state.
 */
export class QuantityForwardFillProjector {
  private readonly groups = new Map<string, QuantityGroupState>();

  project(rawBar: StrategyBar): ProjectedStrategyBar {
    const timestampMs = rawBar.timestamp.getTime();
    if (!Number.isFinite(timestampMs)) {
      throw new TypeError('quantity projection requires a finite timestamp');
    }
    const tradingDay = toShanghaiTradingDay(rawBar.timestamp);
    const key = groupKey(rawBar.securityId, rawBar.source, rawBar.period);
    const prior = this.groups.get(key);
    if (prior && timestampMs <= prior.lastTimestampMs) {
      throw new RangeError(
        'quantity projection requires strictly increasing bars per market group',
      );
    }

    const currentState: QuantityGroupState =
      prior?.tradingDay === tradingDay
        ? prior
        : {
            tradingDay,
            lastTimestampMs: Number.NEGATIVE_INFINITY,
            volume: null,
            amount: null,
          };
    const volume = projectQuantity(rawBar.volume, currentState.volume);
    const amount = projectQuantity(rawBar.amount, currentState.amount);

    this.groups.set(key, {
      tradingDay,
      lastTimestampMs: timestampMs,
      volume: volume.effective,
      amount: amount.effective,
    });

    return Object.freeze({
      rawBar,
      tradingDay,
      volume,
      amount,
    });
  }

  reset(): void {
    this.groups.clear();
  }
}

function projectQuantity(
  raw: string | null,
  previous: string | null,
): ProjectedStrategyQuantity {
  if (raw !== null) {
    Decimal8.parseCanonical(raw);
    return Object.freeze({ raw, effective: raw, resolution: 'observed' });
  }
  if (previous !== null) {
    return Object.freeze({
      raw,
      effective: previous,
      resolution: 'forwardFilled',
    });
  }
  return Object.freeze({ raw, effective: null, resolution: 'unavailable' });
}

function groupKey(
  securityId: number,
  source: StrategyMarketSource,
  period: number,
): string {
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new TypeError('quantity projection requires a positive securityId');
  }
  if (!Number.isSafeInteger(period) || period <= 0) {
    throw new TypeError('quantity projection requires a positive period');
  }
  return `${securityId}\u0000${source}\u0000${period}`;
}

function toShanghaiTradingDay(timestamp: Date): string {
  const parts = SHANGHAI_TRADING_DAY_FORMATTER.formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new TypeError('could not resolve Shanghai trading day');
  }
  return `${year}-${month}-${day}`;
}
