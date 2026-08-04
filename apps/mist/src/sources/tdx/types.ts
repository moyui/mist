import type { TdxExtension } from '../source-fetcher.interface';

export type { TdxExtension } from '../source-fetcher.interface';

/**
 * K-line data mapped from mist-datasource TDX /v1/bars/query.
 */
export interface TdxResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
  extensions?: TdxExtension;
}

export interface TdxDatasourceError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface TdxEnvelope<T> {
  ok: boolean;
  requestId?: string;
  provider: string;
  data: T | null;
  meta: Record<string, unknown> | null;
  error: TdxDatasourceError | null;
}

export interface TdxNormalizedBar {
  symbol: string;
  period: string;
  barTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
  provider: string;
  receivedAt: string;
  forwardFactor?: number | null;
  volInStock?: number | null;
}

export interface TdxBarsResponseData {
  bars: TdxNormalizedBar[];
}

export interface TdxDividendFactorItem {
  symbol?: string;
  date?: string | null;
  forwardFactor?: number | null;
  backwardFactor?: number | null;
  provider?: string;
}

export interface TdxDividendFactorsResponseData {
  items: TdxDividendFactorItem[];
}
