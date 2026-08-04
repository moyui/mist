export type { EfExtension } from '../source-fetcher.interface';

/**
 * East Money minute-level K-line API response
 */
export interface EfMinuteVo {
  时间: string;
  开盘: number;
  收盘: number;
  最高: number;
  最低: number;
  涨跌幅?: number;
  涨跌额?: number;
  成交量: number | string;
  成交额: number | string;
  振幅?: number;
  换手率?: number;
}

/**
 * East Money daily K-line API response
 */
export interface EfDailyVo {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number | string;
  amount: number | string;
}
