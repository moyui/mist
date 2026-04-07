import { Period, Security } from '@app/shared-data';

export interface EfExtension {
  fullCode?: string;
  amplitude?: number;
  changePct?: number;
  changeAmt?: number;
  turnoverRate?: number;
  volumeCount?: number;
  innerVolume?: number;
  outerVolume?: number;
  prevClose?: number;
  prevOpen?: number;
}

export interface TdxExtension {
  fullCode?: string;
  forwardFactor?: number;
  backwardFactor?: number;
  volumeRatio?: number;
  turnoverRate?: number;
  turnoverAmount?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  earningsPerShare?: number;
  priceEarningsRatio?: number;
  priceToBookRatio?: number;
}

export interface MqmtExtension {
  fullCode?: string;
}

export interface ISourceFetcher<TRaw = KData> {
  fetchK(params: KFetchParams): Promise<TRaw[]>;
  saveK(data: TRaw[], security: Security, period: Period): Promise<void>;
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
  extensions?: EfExtension | TdxExtension | MqmtExtension;
}
