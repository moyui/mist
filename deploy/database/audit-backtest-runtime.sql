-- Read-only preflight for extract-backtest-runtime.
-- Do not create a migration number or apply DDL from this file. Record the
-- output from the target appliance before choosing any forward-only change.

SELECT `version`, `applied_at`
FROM `schema_migrations`
ORDER BY `version` ASC;

SELECT
  expected.`table_name`,
  CASE WHEN tables.`TABLE_NAME` IS NULL THEN 0 ELSE 1 END AS `table_exists`
FROM (
  SELECT 'backtest_runs' AS `table_name`
  UNION ALL SELECT 'backtest_signal_results'
) AS expected
LEFT JOIN `information_schema`.`TABLES` AS tables
  ON tables.`TABLE_SCHEMA` = DATABASE()
  AND tables.`TABLE_NAME` = expected.`table_name`
ORDER BY expected.`table_name` ASC;

SELECT 'backtest_runs' AS `table_name`, COUNT(*) AS `row_count`
FROM `backtest_runs`
UNION ALL
SELECT 'backtest_signal_results', COUNT(*) FROM `backtest_signal_results`;

SELECT
  `TABLE_NAME` AS `table_name`,
  `ORDINAL_POSITION` AS `ordinal_position`,
  `COLUMN_NAME` AS `column_name`,
  `COLUMN_TYPE` AS `column_type`,
  `IS_NULLABLE` AS `is_nullable`,
  `COLUMN_DEFAULT` AS `column_default`,
  `EXTRA` AS `extra`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN ('backtest_runs', 'backtest_signal_results')
ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`;

SELECT
  `TABLE_NAME` AS `table_name`,
  `INDEX_NAME` AS `index_name`,
  `NON_UNIQUE` AS `non_unique`,
  `SEQ_IN_INDEX` AS `seq_in_index`,
  `COLUMN_NAME` AS `column_name`,
  `INDEX_TYPE` AS `index_type`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN ('backtest_runs', 'backtest_signal_results')
ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`;

SELECT
  `TABLE_NAME` AS `table_name`,
  `CONSTRAINT_NAME` AS `constraint_name`,
  `CONSTRAINT_TYPE` AS `constraint_type`
FROM `information_schema`.`TABLE_CONSTRAINTS`
WHERE `CONSTRAINT_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN ('backtest_runs', 'backtest_signal_results')
ORDER BY `TABLE_NAME`, `CONSTRAINT_NAME`;

SHOW CREATE TABLE `backtest_runs`;
SHOW CREATE TABLE `backtest_signal_results`;
