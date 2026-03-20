export interface ISourceFetcher {
  fetchKLine(params: KLineFetchParams): Promise<KLineData[]>;
  isSupportedPeriod(period: number): boolean;
}

export interface KLineFetchParams {
  code: string;
  period: number;
  startDate: Date;
  endDate: Date;
}

export interface KLineData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  period: number;
}