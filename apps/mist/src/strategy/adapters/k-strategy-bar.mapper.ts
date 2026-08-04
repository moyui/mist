import { DataSource, K } from '@app/shared-data';
import {
  KPriceProjector,
  type StrategyBar,
  type StrategyMarketSource,
} from '@app/strategy';

export function mapKToStrategyBar(k: K): StrategyBar {
  if (
    !k.security ||
    !Number.isSafeInteger(k.security.id) ||
    k.security.id <= 0
  ) {
    throw new TypeError('historical strategy K requires a positive securityId');
  }

  return Object.freeze({
    securityId: k.security.id,
    source: mapSource(k.source),
    period: requirePositivePeriod(k.period),
    timestamp: new Date(k.timestamp.getTime()),
    open: KPriceProjector(k.open as unknown as string | number),
    high: KPriceProjector(k.high as unknown as string | number),
    low: KPriceProjector(k.low as unknown as string | number),
    close: KPriceProjector(k.close as unknown as string | number),
    volume: k.volume,
    amount: k.amount,
    type: 'complete',
  });
}

function mapSource(source: DataSource): StrategyMarketSource {
  switch (source) {
    case DataSource.EAST_MONEY:
      return 'ef';
    case DataSource.TDX:
      return 'tdx';
    case DataSource.QMT:
      return 'qmt';
  }
  throw new TypeError(
    `unsupported historical strategy source: ${String(source)}`,
  );
}

function requirePositivePeriod(period: number): number {
  if (!Number.isSafeInteger(period) || period <= 0) {
    throw new TypeError('historical strategy K requires a positive period');
  }
  return period;
}
