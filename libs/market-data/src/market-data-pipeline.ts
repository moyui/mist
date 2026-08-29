import { KPriceProjector } from './k-price-projector';
import type { StrategyBar } from './strategy-bar';
import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import type { K } from '@app/shared-data';
import { DataSource } from '@app/shared-data';
import {
  StrategySeriesImputer,
  type ProjectedStrategyBar,
  type StrategyImputationResolution,
} from './projection/strategy-series-imputer';

export class MarketDataPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataPipelineError';
  }
}

export interface MarketDataPipelineInput {
  readonly rawBars: readonly K[] | readonly StrategyBar[];
  readonly period: number;
  readonly requiredBars: number;
  readonly historyBars?: readonly StrategyBar[];
  readonly windowStartAt?: Date;
  readonly windowEndAt?: Date;
}

export interface MarketDataPipelineDiagnostics {
  readonly tradingDay: string | null;
  readonly resolutionCounts: Record<StrategyImputationResolution, number>;
}

export interface MarketDataPipelineOutput {
  readonly projected: readonly ProjectedStrategyBar[];
  readonly requestedKlines: number;
  readonly droppedKlines: number;
  readonly effectiveKlines: number;
  readonly diagnostics: MarketDataPipelineDiagnostics;
}

function detectKEntity(bars: readonly (K | StrategyBar)[]): boolean {
  if (bars.length === 0) return false;
  const first = bars[0] as unknown as Record<string, unknown>;
  // K entities from DB have string open/high/low/close (DECIMAL as string)
  // StrategyBar has number open/high/low/close already projected
  return typeof first['open'] === 'string';
}

function mapKToStrategyBarInternal(k: K): StrategyBar | null {
  try {
    const securityId =
      (k.security as unknown as { id?: number } | undefined)?.id ??
      (k as unknown as { securityId?: number }).securityId;
    if (!Number.isSafeInteger(securityId) || (securityId as number) <= 0) {
      return null;
    }
    const source = mapSource(k.source as unknown as string);
    if (!source) return null;
    const period =
      typeof k.period === 'number' &&
      Number.isSafeInteger(k.period) &&
      k.period > 0
        ? k.period
        : null;
    if (period === null) return null;
    const timestamp =
      k.timestamp instanceof Date && Number.isFinite(k.timestamp.getTime())
        ? new Date(k.timestamp.getTime())
        : null;
    if (!timestamp) return null;

    // Open/High/Low/Close: K entity stores as string "10.00", TypeORM returns string
    // Convert via KPriceProjector: string must be DECIMAL(20,2) canonical, number must be finite
    // Most cases are string + toFixed(2), so we just project
    let open: number;
    let high: number;
    let low: number;
    let close: number;
    try {
      open = KPriceProjector(k.open as unknown as string | number);
      high = KPriceProjector(k.high as unknown as string | number);
      low = KPriceProjector(k.low as unknown as string | number);
      close = KPriceProjector(k.close as unknown as string | number);
    } catch {
      return null;
    }

    // volume/amount: K stores as string | null (DECIMAL 36,8), canonicalDecimalTransformer normalizes
    // Here we just preserve normalized text or null; invalid canonical text will be caught by Imputer
    const volume = normalizeQuantityField(k.volume);
    const amount = normalizeQuantityField(k.amount);
    // If volume/amount is present but invalid canonical text, treat as null (will be imputed as unavailable)
    // But don't drop the whole bar for quantity invalid alone; OHLC invalid already dropped above

    return Object.freeze({
      securityId: securityId as number,
      source,
      period,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      amount,
      type: 'complete' as const,
    });
  } catch {
    return null;
  }
}

function normalizeQuantityField(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    // In case TypeORM returns number for some reason
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      // Normalize via Decimal8: but number 0 should be "0"
      try {
        return Decimal8.parseCanonical(String(value)).formatCanonical();
      } catch {
        return null;
      }
    }
    return null;
  }
  // String from DB: normalizeExternalDecimalText validates and canonicalizes
  // But if it's already canonical like "100.00000000" -> normalize -> "100" etc
  // For volume/amount, we want canonical compact form
  try {
    // Allow "0" or "0.00000000" -> normalize to "0"
    // normalizeExternalDecimalText handles DECIMAL(36,8) external text
    return normalizeExternalDecimalText(value);
  } catch {
    // If not external format but already canonical internal like "0" or "100"
    try {
      return Decimal8.parseCanonical(value).formatCanonical();
    } catch {
      return null;
    }
  }
}

function mapSource(source: string): StrategyBar['source'] | null {
  // DataSource enum values: ef, tdx, qmt (check)
  if (source === DataSource.EAST_MONEY || source === 'ef') return 'ef';
  if (source === DataSource.TDX || source === 'tdx') return 'tdx';
  if (source === DataSource.QMT || source === 'qmt') return 'qmt';
  return null;
}

/**
 * Unified market data pipeline: precision gate → Imputer補齊 → 消費視圖
 *
 * 單一全域平台，歷史/實時/展示/指標/回測/信號 全部走同一份程式碼。
 * 順序不變量：先單根精度門控，再 StrategySeriesImputer 補齊，最後產生視圖。
 * - 非法 bar（OHLC 非 DECIMAL 20,2 / 非 finite）整根 dropped，不作補齊錨點
 * - 合法 bar 進入 Imputer，根據 isOhlcAnchor / isQuantityAnchor 產生 backfilled/forwardFilled/unavailable
 * - 歷史/實時同一實作：hydrated 歷史 segment 雙向定死，append 窗口單向 forwardFill，跨日重置
 */
export function prepareMarketData(
  input: MarketDataPipelineInput,
): MarketDataPipelineOutput {
  const { rawBars, historyBars, requiredBars } = input;
  const isKInput = detectKEntity(rawBars as readonly (K | StrategyBar)[]);

  const requestedKlines = rawBars.length;
  let droppedKlines = 0;
  const strategyBars: StrategyBar[] = [];

  if (isKInput) {
    // RawBars are K entities: need K → StrategyBar projection with precision gate
    for (const k of rawBars as readonly K[]) {
      const projected = mapKToStrategyBarInternal(k);
      if (projected === null) {
        droppedKlines += 1;
      } else {
        strategyBars.push(projected);
      }
    }
  } else {
    // RawBars are already StrategyBar: validate precision already done at construction
    // But still need to guard against invalid StrategyBar with NaN prices
    for (const bar of rawBars as readonly StrategyBar[]) {
      // Validate OHLC are finite; if not, drop (will not be anchor, but keep consistent)
      if (
        !Number.isFinite(bar.open) ||
        !Number.isFinite(bar.high) ||
        !Number.isFinite(bar.low) ||
        !Number.isFinite(bar.close) ||
        bar.open < 0 ||
        bar.high < 0 ||
        bar.low < 0 ||
        bar.close < 0
      ) {
        droppedKlines += 1;
        continue;
      }
      // Strictly increasing timestamp check will be done by Imputer; just collect
      strategyBars.push(bar);
    }
  }

  // History bars are already StrategyBar, already precision gated
  const historyValidated: StrategyBar[] = [];
  if (historyBars && historyBars.length > 0) {
    for (const bar of historyBars) {
      if (
        !Number.isFinite(bar.open) ||
        !Number.isFinite(bar.high) ||
        !Number.isFinite(bar.low) ||
        !Number.isFinite(bar.close)
      ) {
        continue;
      }
      historyValidated.push(bar);
    }
  }

  // Now run Imputer: history → hydrate (bidirectional), window → append (forwardFill only)
  let projected: readonly ProjectedStrategyBar[];
  {
    const imputer = new StrategySeriesImputer();
    if (historyValidated.length > 0) {
      // History segment: bidirectional imputation, frozen
      imputer.hydrate(historyValidated);
      // Enforce capacity: keep only requiredBars if history alone exceeds
      while (imputer.read().length > requiredBars) {
        imputer.trim();
      }
    }
    // Append window bars one by one (forwardFill only)
    for (const bar of strategyBars) {
      imputer.append(bar);
      while (imputer.read().length > requiredBars) {
        imputer.trim();
      }
    }
    // If no history, hydrate directly with window bars (bidirectional for initial window)
    if (historyValidated.length === 0 && strategyBars.length > 0) {
      // For initial window without history, we need bidirectional imputation
      // So if we appended one-by-one without history, leading gaps would be unavailable
      // Instead, re-hydrate the whole window bidirectionally if no history
      const allBars = strategyBars;
      if (allBars.length > 0) {
        // Check if we need bidirectional: if first bars would be backfilled
        // Simplest: rebuild with imputeSeries for the window alone when no history
        imputer.reset();
        imputer.hydrate(allBars);
        while (imputer.read().length > requiredBars) {
          imputer.trim();
        }
      }
      projected = imputer.read();
    } else {
      projected = imputer.read();
    }
  }

  const effectiveKlines = projected.length;
  const resolutionCounts: Record<StrategyImputationResolution, number> = {
    observed: 0,
    backfilled: 0,
    forwardFilled: 0,
    unavailable: 0,
  };
  let tradingDay: string | null = null;
  for (const bar of projected) {
    resolutionCounts[bar.ohlc.resolution] += 1;
    if (tradingDay === null) tradingDay = bar.tradingDay;
  }

  return Object.freeze({
    projected,
    requestedKlines,
    droppedKlines,
    effectiveKlines,
    diagnostics: Object.freeze({
      tradingDay,
      resolutionCounts: Object.freeze({ ...resolutionCounts }),
    }),
  });
}

/**
 * Helper: count bars that would be dropped due to precision gate without running full pipeline
 */
export function countPrecisionDropped(bars: readonly K[]): number {
  let dropped = 0;
  for (const k of bars) {
    if (mapKToStrategyBarInternal(k) === null) dropped += 1;
  }
  return dropped;
}
