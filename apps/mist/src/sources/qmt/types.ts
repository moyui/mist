import type { QmtExtension } from '../source-fetcher.interface';

export type { QmtExtension } from '../source-fetcher.interface';

export interface QmtResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
  period: number;
  extensions?: QmtExtension;
}

export interface QmtDatasourceError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface QmtEnvelope<T> {
  ok: boolean;
  requestId?: string;
  provider: string;
  data: T | null;
  meta: Record<string, unknown> | null;
  error: QmtDatasourceError | null;
}

export type QmtFieldColumn =
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

export type QmtSymbolMarketData = Record<string, QmtFieldColumn>;

export interface QmtBarsResponseData {
  marketData: Record<string, QmtSymbolMarketData>;
}
