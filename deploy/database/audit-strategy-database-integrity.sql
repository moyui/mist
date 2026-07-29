-- Every violation_count returned by this audit must be zero before applying
-- 009_strategy_database_integrity.sql. This audit is read-only and does not
-- synthesize missing snapshot evidence.

SELECT
  'current_version_missing_or_foreign' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM `strategy_definitions` AS `definition`
LEFT JOIN `strategy_versions` AS `version`
  ON `version`.`id` = `definition`.`current_version_id`
  AND `version`.`strategy_definition_id` = `definition`.`id`
WHERE `definition`.`current_version_id` IS NOT NULL
  AND `version`.`id` IS NULL;

SELECT
  'enabled_definition_without_current_version' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM `strategy_definitions`
WHERE `status` = 'enabled'
  AND `current_version_id` IS NULL;

SELECT
  'strategy_signal_null_snapshot' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM `strategy_signals`
WHERE `context_snapshot` IS NULL
  OR `rule_snapshot` IS NULL;

SELECT
  'backtest_result_null_snapshot' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM `backtest_signal_results`
WHERE `context_snapshot` IS NULL
  OR `rule_snapshot` IS NULL;

SELECT
  'backtest_result_run_mismatch' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM `backtest_signal_results` AS `result`
INNER JOIN `backtest_runs` AS `run`
  ON `run`.`id` = `result`.`backtest_run_id`
WHERE `result`.`strategy_definition_id` <> `run`.`strategy_definition_id`
  OR `result`.`strategy_version_id` <> `run`.`strategy_version_id`
  OR `result`.`period` <> `run`.`period`
  OR `result`.`source` <> `run`.`source`;

SELECT
  'duplicate_backtest_result_identity' AS `check_name`,
  COUNT(*) AS `violation_count`
FROM (
  SELECT
    `backtest_run_id`,
    `security_code`,
    `signal_time`
  FROM `backtest_signal_results`
  GROUP BY
    `backtest_run_id`,
    `security_code`,
    `signal_time`
  HAVING COUNT(*) > 1
) AS `duplicate_identity`;
