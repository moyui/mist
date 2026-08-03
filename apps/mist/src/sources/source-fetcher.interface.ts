import { Period, Security } from '@app/shared-data';

export interface EfExtension {
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
  forwardFactor?: number;
  volInStock?: number;
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

export interface QmtExtension {
  preClose?: number;
  suspendFlag?: number;
  openInterest?: number;
  settle?: number;
}

export interface ISourceFetcher<TRaw = KData> {
  fetchK(params: KFetchParams): Promise<TRaw[]>;
  saveK(data: TRaw[], security: Security, period: Period): Promise<void>;
  isSupportedPeriod(period: Period): boolean;
}

export interface KFetchParams {
  code: string;
  formatCode: string;
  period: Period;
  startDate: Date;
  endDate: Date;
}

export interface KData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
  period: number;
  extensions?: EfExtension | TdxExtension | QmtExtension;
}
