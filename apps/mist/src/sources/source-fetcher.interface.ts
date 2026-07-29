import { Period, Security } from '@app/shared-data';
import type { KDecimal } from './k-decimal.util';

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
  nativePeriod?: string;
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
  volume: KDecimal | null;
  amount: KDecimal | null;
  period: number;
  extensions?: EfExtension | TdxExtension | QmtExtension;
}
