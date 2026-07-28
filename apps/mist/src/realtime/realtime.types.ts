/** Supported realtime provider identities. */
export type RealtimeSource = 'tdx' | 'qmt';

export interface RealtimeNativeMapFrame {
  schemaVersion: 2;
  capturedAt: string;
  native: Record<string, unknown>;
}

export interface CanonicalRealtimeSnapshot {
  source: RealtimeSource;
  securityId: number;
  providerSymbol: string;
  eventTime: string | null;
  capturedAt: string;
  prices: {
    last: number;
    open: number | null;
    high: number | null;
    low: number | null;
    lastClose: number | null;
  };
  cumulativeVolume: number | null;
  cumulativeAmount: number | null;
  quality: {
    level: 'latest-state';
    eventTimeAvailable: boolean;
    aggregationEligible: boolean;
    partialPrices: boolean;
  };
  native: Readonly<Record<string, unknown>>;
}

export const REALTIME_NATIVE_CONTRACT = {
  schemaVersion: 2,
} as const;
