-- Read-only postflight/readback for extract-backtest-runtime.
-- Every *_ready expression must be 1 before production cutover.

SELECT
  (
    SELECT COUNT(*) = 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'backtest_runs'
      AND `COLUMN_NAME` = 'target_issues'
      AND `COLUMN_TYPE` = 'json'
      AND `IS_NULLABLE` = 'NO'
      AND LOWER(CAST(`COLUMN_DEFAULT` AS CHAR)) IN ('[]', 'json_array()', '(json_array())')
  ) AS `backtest_target_issues_ready`,
  (
    SELECT COUNT(*) = 1
    FROM (
      SELECT `INDEX_NAME`
      FROM `information_schema`.`STATISTICS`
      WHERE `TABLE_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'backtest_signal_results'
        AND `INDEX_NAME` = 'idx_backtest_signal_results_run_time_id'
        AND `NON_UNIQUE` = 1
      GROUP BY `INDEX_NAME`
      HAVING COUNT(*) = 3
        AND SUM(`SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'backtest_run_id') = 1
        AND SUM(`SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'signal_time') = 1
        AND SUM(`SEQ_IN_INDEX` = 3 AND `COLUMN_NAME` = 'id') = 1
    ) AS pagination_index
  ) AS `backtest_result_pagination_index_ready`,
  (
    SELECT COUNT(*) >= 1
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'backtest_signal_results'
      AND `INDEX_NAME` = 'uq_backtest_signal_results_run_security_time'
      AND `NON_UNIQUE` = 0
  ) AS `backtest_result_identity_unique_ready`;

SELECT `version`, `applied_at`
FROM `schema_migrations`
ORDER BY `version` ASC;

SHOW CREATE TABLE `backtest_runs`;
SHOW CREATE TABLE `backtest_signal_results`;
SHOW INDEX FROM `backtest_signal_results`;
