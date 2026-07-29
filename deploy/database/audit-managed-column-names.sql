-- Read-only audit for migration 010_normalize_managed_column_names.sql.
-- Run once before migration 010 and once after it. Every row must report
-- pre_migration_ready before the migration or post_migration_ready after it.

DROP TEMPORARY TABLE IF EXISTS `expected_managed_column_renames`;
CREATE TEMPORARY TABLE `expected_managed_column_renames` (
  `table_name` varchar(64) NOT NULL,
  `old_column_name` varchar(64) NOT NULL,
  `new_column_name` varchar(64) NOT NULL,
  PRIMARY KEY (`table_name`, `old_column_name`, `new_column_name`)
);

INSERT INTO `expected_managed_column_renames`
  (`table_name`, `old_column_name`, `new_column_name`)
VALUES
  ('security_source_configs', 'formatCode', 'format_code'),
  ('k', 'securityId', 'security_id'),
  ('k_extensions_ef', 'changePct', 'change_pct'),
  ('k_extensions_ef', 'changeAmt', 'change_amt'),
  ('k_extensions_ef', 'turnoverRate', 'turnover_rate'),
  ('k_extensions_ef', 'volumeCount', 'volume_count'),
  ('k_extensions_ef', 'innerVolume', 'inner_volume'),
  ('k_extensions_ef', 'outerVolume', 'outer_volume'),
  ('k_extensions_ef', 'prevClose', 'prev_close'),
  ('k_extensions_ef', 'prevOpen', 'prev_open'),
  ('k_extensions_tdx', 'forwardFactor', 'forward_factor'),
  ('k_extensions_tdx', 'volInStock', 'vol_in_stock'),
  ('k_extensions_tdx', 'backwardFactor', 'backward_factor'),
  ('k_extensions_tdx', 'volumeRatio', 'volume_ratio'),
  ('k_extensions_tdx', 'turnoverRate', 'turnover_rate'),
  ('k_extensions_tdx', 'turnoverAmount', 'turnover_amount'),
  ('k_extensions_tdx', 'totalMarketValue', 'total_market_value'),
  ('k_extensions_tdx', 'floatMarketValue', 'float_market_value'),
  ('k_extensions_tdx', 'earningsPerShare', 'earnings_per_share'),
  ('k_extensions_tdx', 'priceEarningsRatio', 'price_earnings_ratio'),
  ('k_extensions_tdx', 'priceToBookRatio', 'price_to_book_ratio'),
  ('k_extensions_qmt', 'preClose', 'pre_close'),
  ('k_extensions_qmt', 'suspendFlag', 'suspend_flag'),
  ('k_extensions_qmt', 'openInterest', 'open_interest'),
  ('k_extensions_qmt', 'effectiveDividendType', 'effective_dividend_type'),
  ('k_extensions_qmt', 'nativePeriod', 'native_period');

SELECT
  `expected`.`table_name`,
  `expected`.`old_column_name`,
  `expected`.`new_column_name`,
  (`old_column`.`column_name` IS NOT NULL) AS `old_column_exists`,
  (`new_column`.`column_name` IS NOT NULL) AS `new_column_exists`,
  CASE
    WHEN `old_column`.`column_name` IS NOT NULL
      AND `new_column`.`column_name` IS NULL
      THEN 'pre_migration_ready'
    WHEN `old_column`.`column_name` IS NULL
      AND `new_column`.`column_name` IS NOT NULL
      THEN 'post_migration_ready'
    ELSE 'invalid'
  END AS `migration_state`
FROM `expected_managed_column_renames` AS `expected`
LEFT JOIN `information_schema`.`columns` AS `old_column`
  ON `old_column`.`table_schema` = DATABASE()
  AND `old_column`.`table_name` = `expected`.`table_name`
  AND BINARY `old_column`.`column_name` = BINARY `expected`.`old_column_name`
LEFT JOIN `information_schema`.`columns` AS `new_column`
  ON `new_column`.`table_schema` = DATABASE()
  AND `new_column`.`table_name` = `expected`.`table_name`
  AND BINARY `new_column`.`column_name` = BINARY `expected`.`new_column_name`
ORDER BY
  `expected`.`table_name`,
  `expected`.`old_column_name`;

SELECT
  SUM(`old_column`.`column_name` IS NOT NULL) AS `old_column_count`,
  SUM(`new_column`.`column_name` IS NOT NULL) AS `new_column_count`,
  SUM(
    (`old_column`.`column_name` IS NULL)
      = (`new_column`.`column_name` IS NULL)
  ) AS `invalid_mapping_count`
FROM `expected_managed_column_renames` AS `expected`
LEFT JOIN `information_schema`.`columns` AS `old_column`
  ON `old_column`.`table_schema` = DATABASE()
  AND `old_column`.`table_name` = `expected`.`table_name`
  AND BINARY `old_column`.`column_name` = BINARY `expected`.`old_column_name`
LEFT JOIN `information_schema`.`columns` AS `new_column`
  ON `new_column`.`table_schema` = DATABASE()
  AND `new_column`.`table_name` = `expected`.`table_name`
  AND BINARY `new_column`.`column_name` = BINARY `expected`.`new_column_name`;

-- Post-migration this result set must be empty. The table allowlist intentionally
-- excludes provider-native payloads and unmanaged external schemas.
SELECT
  `table_name`,
  `column_name`
FROM `information_schema`.`columns`
WHERE `table_schema` = DATABASE()
  AND `table_name` IN (
    'security_source_configs',
    'k',
    'k_extensions_ef',
    'k_extensions_tdx',
    'k_extensions_qmt'
  )
  AND BINARY `column_name` REGEXP BINARY '[A-Z]'
ORDER BY `table_name`, `ordinal_position`;

DROP TEMPORARY TABLE `expected_managed_column_renames`;
