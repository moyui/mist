-- Read-only production preflight for evolve-strategy-evaluation-contract.
-- Do not apply schema changes when any target row_count is non-zero or when
-- this inventory differs from the reviewed repository baseline.

SELECT
  `version`,
  `applied_at`
FROM `schema_migrations`
ORDER BY `version` ASC;

SELECT
  expected.`table_name`,
  CASE WHEN tables.`TABLE_NAME` IS NULL THEN 0 ELSE 1 END AS `table_exists`
FROM (
  SELECT 'strategy_definitions' AS `table_name`
  UNION ALL SELECT 'strategy_versions'
  UNION ALL SELECT 'strategy_signals'
  UNION ALL SELECT 'strategy_alert_events'
  UNION ALL SELECT 'backtest_runs'
  UNION ALL SELECT 'backtest_signal_results'
) AS expected
LEFT JOIN `information_schema`.`TABLES` AS tables
  ON tables.`TABLE_SCHEMA` = DATABASE()
  AND tables.`TABLE_NAME` = expected.`table_name`
ORDER BY expected.`table_name` ASC;

SELECT 'strategy_definitions' AS `table_name`, COUNT(*) AS `row_count`
FROM `strategy_definitions`
UNION ALL
SELECT 'strategy_versions', COUNT(*) FROM `strategy_versions`
UNION ALL
SELECT 'strategy_signals', COUNT(*) FROM `strategy_signals`
UNION ALL
SELECT 'strategy_alert_events', COUNT(*) FROM `strategy_alert_events`
UNION ALL
SELECT 'backtest_runs', COUNT(*) FROM `backtest_runs`
UNION ALL
SELECT 'backtest_signal_results', COUNT(*) FROM `backtest_signal_results`
ORDER BY `table_name` ASC;

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
  AND `TABLE_NAME` IN (
    'strategy_definitions',
    'strategy_versions',
    'strategy_signals',
    'strategy_alert_events',
    'backtest_runs',
    'backtest_signal_results'
  )
ORDER BY `TABLE_NAME` ASC, `ORDINAL_POSITION` ASC;

SELECT
  `TABLE_NAME` AS `table_name`,
  `INDEX_NAME` AS `index_name`,
  `NON_UNIQUE` AS `non_unique`,
  `SEQ_IN_INDEX` AS `seq_in_index`,
  `COLUMN_NAME` AS `column_name`,
  `COLLATION` AS `collation`,
  `INDEX_TYPE` AS `index_type`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'strategy_definitions',
    'strategy_versions',
    'strategy_signals',
    'strategy_alert_events',
    'backtest_runs',
    'backtest_signal_results'
  )
ORDER BY `TABLE_NAME` ASC, `INDEX_NAME` ASC, `SEQ_IN_INDEX` ASC;

SELECT
  constraints.`TABLE_NAME` AS `table_name`,
  constraints.`CONSTRAINT_NAME` AS `constraint_name`,
  constraints.`CONSTRAINT_TYPE` AS `constraint_type`,
  usage_rows.`COLUMN_NAME` AS `column_name`,
  usage_rows.`REFERENCED_TABLE_NAME` AS `referenced_table_name`,
  usage_rows.`REFERENCED_COLUMN_NAME` AS `referenced_column_name`
FROM `information_schema`.`TABLE_CONSTRAINTS` AS constraints
LEFT JOIN `information_schema`.`KEY_COLUMN_USAGE` AS usage_rows
  ON usage_rows.`CONSTRAINT_SCHEMA` = constraints.`CONSTRAINT_SCHEMA`
  AND usage_rows.`TABLE_NAME` = constraints.`TABLE_NAME`
  AND usage_rows.`CONSTRAINT_NAME` = constraints.`CONSTRAINT_NAME`
WHERE constraints.`CONSTRAINT_SCHEMA` = DATABASE()
  AND constraints.`TABLE_NAME` IN (
    'strategy_definitions',
    'strategy_versions',
    'strategy_signals',
    'strategy_alert_events',
    'backtest_runs',
    'backtest_signal_results'
  )
ORDER BY
  constraints.`TABLE_NAME` ASC,
  constraints.`CONSTRAINT_NAME` ASC,
  usage_rows.`ORDINAL_POSITION` ASC;

SHOW CREATE TABLE `strategy_definitions`;
SHOW CREATE TABLE `strategy_versions`;
SHOW CREATE TABLE `strategy_signals`;
SHOW CREATE TABLE `strategy_alert_events`;
SHOW CREATE TABLE `backtest_runs`;
SHOW CREATE TABLE `backtest_signal_results`;
