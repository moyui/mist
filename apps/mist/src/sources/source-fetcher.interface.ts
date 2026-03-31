import { Period } from '@app/shared-data';

export interface ISourceFetcher {
  fetchK(params: KFetchParams): Promise<KData[]>;
  isSupportedPeriod(period: Period): boolean;
}

export interface KFetchParams {
  code: string;
  formatCode: string;
  period: number;
  startDate: Date;
  endDate: Date;
}

export interface KData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  period: number;
}
