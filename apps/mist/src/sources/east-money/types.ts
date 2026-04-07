/**
 * East Money K-line extension fields (from index_zh_a_hist_min_em API)
 */
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
  成交量: number;
  成交额: number;
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
  volume: number;
  amount: number;
}
