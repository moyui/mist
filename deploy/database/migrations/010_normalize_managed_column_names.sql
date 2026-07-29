ALTER TABLE `security_source_configs`
  RENAME COLUMN `formatCode` TO `format_code`;

ALTER TABLE `k`
  RENAME COLUMN `securityId` TO `security_id`;

ALTER TABLE `k_extensions_ef`
  RENAME COLUMN `changePct` TO `change_pct`,
  RENAME COLUMN `changeAmt` TO `change_amt`,
  RENAME COLUMN `turnoverRate` TO `turnover_rate`,
  RENAME COLUMN `volumeCount` TO `volume_count`,
  RENAME COLUMN `innerVolume` TO `inner_volume`,
  RENAME COLUMN `outerVolume` TO `outer_volume`,
  RENAME COLUMN `prevClose` TO `prev_close`,
  RENAME COLUMN `prevOpen` TO `prev_open`;

ALTER TABLE `k_extensions_tdx`
  RENAME COLUMN `forwardFactor` TO `forward_factor`,
  RENAME COLUMN `volInStock` TO `vol_in_stock`,
  RENAME COLUMN `backwardFactor` TO `backward_factor`,
  RENAME COLUMN `volumeRatio` TO `volume_ratio`,
  RENAME COLUMN `turnoverRate` TO `turnover_rate`,
  RENAME COLUMN `turnoverAmount` TO `turnover_amount`,
  RENAME COLUMN `totalMarketValue` TO `total_market_value`,
  RENAME COLUMN `floatMarketValue` TO `float_market_value`,
  RENAME COLUMN `earningsPerShare` TO `earnings_per_share`,
  RENAME COLUMN `priceEarningsRatio` TO `price_earnings_ratio`,
  RENAME COLUMN `priceToBookRatio` TO `price_to_book_ratio`;

ALTER TABLE `k_extensions_qmt`
  RENAME COLUMN `preClose` TO `pre_close`,
  RENAME COLUMN `suspendFlag` TO `suspend_flag`,
  RENAME COLUMN `openInterest` TO `open_interest`,
  RENAME COLUMN `effectiveDividendType` TO `effective_dividend_type`,
  RENAME COLUMN `nativePeriod` TO `native_period`;
