import {
  Decimal8,
  normalizeExternalDecimalText,
  type Decimal8UnitFactor,
} from '@app/decimal';
import {
  KPriceProjector,
  type StrategyBar,
  type StrategyMarketSource,
} from '@app/strategy';
import { DataSource } from '../enums/data-source.enum';
import { K } from '../entities/k.entity';

export function mapKToStrategyBar(k: K): StrategyBar {
  const securityId = selectedSecurityId(k);
  return Object.freeze({
    securityId,
    source: mapSource(k.source),
    period: requirePositivePeriod(k.period),
    timestamp: requireTimestamp(k.timestamp),
    open: KPriceProjector(k.open as unknown as string | number),
    high: KPriceProjector(k.high as unknown as string | number),
    low: KPriceProjector(k.low as unknown as string | number),
    close: KPriceProjector(k.close as unknown as string | number),
    volume: mapHistoricalQuantity(k.volume),
    amount: mapHistoricalAmount(k.source, k.amount),
    type: 'complete',
  });
}

function selectedSecurityId(k: K): number {
  const securityId = k.security?.id ?? k.securityId;
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new TypeError('historical strategy K requires a positive securityId');
  }
  return securityId;
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

function mapHistoricalQuantity(value: string | null): string | null {
  if (value === null) return null;
  return normalizeExternalDecimalText(value);
}

function mapHistoricalAmount(
  source: DataSource,
  value: string | null,
): string | null {
  const canonical = mapHistoricalQuantity(value);
  if (canonical === null) return null;
  const factor: Decimal8UnitFactor | null =
    source === DataSource.TDX ? 10_000 : null;
  return factor === null
    ? canonical
    : Decimal8.parseCanonical(canonical).scaleByUnit(factor).formatCanonical();
}

function requireTimestamp(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('historical strategy K requires a valid timestamp');
  }
  return new Date(value.getTime());
}

function requirePositivePeriod(period: number): number {
  if (!Number.isSafeInteger(period) || period <= 0) {
    throw new TypeError('historical strategy K requires a positive period');
  }
  return period;
}
