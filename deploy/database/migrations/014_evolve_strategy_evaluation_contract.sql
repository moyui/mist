-- Production preflight on 2026-08-04 proved migrations 001-013 and zero rows
-- in all strategy/backtest tables. Recheck the zero-data and exact schema gate
-- at execution time; do not infer or rewrite legacy strategy data.

SET @strategy_contract_row_count = (
  SELECT
    (SELECT COUNT(*) FROM `strategy_definitions`) +
    (SELECT COUNT(*) FROM `strategy_versions`) +
    (SELECT COUNT(*) FROM `strategy_signals`) +
    (SELECT COUNT(*) FROM `strategy_alert_events`) +
    (SELECT COUNT(*) FROM `backtest_runs`) +
    (SELECT COUNT(*) FROM `backtest_signal_results`)
);

SET @version_signal_kind_pre = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_versions'
    AND `COLUMN_NAME` = 'signal_kind'
);

SET @version_signal_kind_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_versions'
    AND `COLUMN_NAME` = 'signal_kind'
    AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')'
    AND `IS_NULLABLE` = 'NO'
    AND `COLUMN_DEFAULT` IS NULL
);

SET @signal_security_code_pre = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'security_code'
    AND `COLUMN_TYPE` = 'varchar(20)'
    AND `IS_NULLABLE` = 'NO'
);

SET @signal_security_id_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'security_id'
);

SET @signal_kind_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'signal_kind'
);

SET @signal_security_code_index_pre = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `INDEX_NAME` = 'idx_strategy_signals_security_time'
    AND `NON_UNIQUE` = 1
    AND (
      (`SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'security_code') OR
      (`SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'signal_time')
    )
);

SET @signal_security_fk_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`TABLE_CONSTRAINTS`
  WHERE `CONSTRAINT_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `CONSTRAINT_NAME` = 'fk_strategy_signals_security'
);

SET @signal_unapproved_unique_count = (
  SELECT COUNT(*)
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `NON_UNIQUE` = 0
    AND `INDEX_NAME` <> 'PRIMARY'
);

SET @signal_pre = (
  @signal_security_code_pre = 1 AND
  @signal_security_id_absent = 1 AND
  @signal_kind_absent = 1 AND
  @signal_security_code_index_pre = 1 AND
  @signal_security_fk_absent = 1 AND
  @signal_unapproved_unique_count = 0
);

SET @signal_security_code_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'security_code'
);

SET @signal_security_id_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'security_id'
    AND `COLUMN_TYPE` = 'int'
    AND `IS_NULLABLE` = 'NO'
    AND `COLUMN_DEFAULT` IS NULL
);

SET @signal_kind_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'signal_kind'
    AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')'
    AND `IS_NULLABLE` = 'NO'
    AND `COLUMN_DEFAULT` IS NULL
);

SET @signal_security_id_index_post = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `INDEX_NAME` = 'idx_strategy_signals_security_time'
    AND `NON_UNIQUE` = 1
    AND (
      (`SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'security_id') OR
      (`SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'signal_time')
    )
);

SET @signal_security_fk_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`KEY_COLUMN_USAGE` AS `usage_rows`
  JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `references_rows`
    ON `references_rows`.`CONSTRAINT_SCHEMA` = `usage_rows`.`CONSTRAINT_SCHEMA`
    AND `references_rows`.`TABLE_NAME` = `usage_rows`.`TABLE_NAME`
    AND `references_rows`.`CONSTRAINT_NAME` = `usage_rows`.`CONSTRAINT_NAME`
  WHERE `usage_rows`.`CONSTRAINT_SCHEMA` = DATABASE()
    AND `usage_rows`.`TABLE_NAME` = 'strategy_signals'
    AND `usage_rows`.`CONSTRAINT_NAME` = 'fk_strategy_signals_security'
    AND `usage_rows`.`COLUMN_NAME` = 'security_id'
    AND `usage_rows`.`REFERENCED_TABLE_NAME` = 'securities'
    AND `usage_rows`.`REFERENCED_COLUMN_NAME` = 'id'
    AND `references_rows`.`DELETE_RULE` = 'RESTRICT'
    AND `references_rows`.`UPDATE_RULE` = 'RESTRICT'
);

SET @signal_post = (
  @signal_security_code_absent = 1 AND
  @signal_security_id_post = 1 AND
  @signal_kind_post = 1 AND
  @signal_security_id_index_post = 1 AND
  @signal_security_fk_post = 1 AND
  @signal_unapproved_unique_count = 0
);

SET @strategy_contract_known_state = (
  (@version_signal_kind_pre = 1 AND @signal_pre = 1) OR
  (@version_signal_kind_post = 1 AND @signal_pre = 1) OR
  (@version_signal_kind_post = 1 AND @signal_post = 1)
);

SET @assert_strategy_contract_sql = IF(
  @strategy_contract_row_count = 0 AND @strategy_contract_known_state = 1,
  'SELECT 1 AS strategy_evaluation_contract_preflight_ready',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Strategy evaluation migration requires zero strategy/backtest rows and an exact pre, known partial, or post schema state'''
);
PREPARE stmt FROM @assert_strategy_contract_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @evolve_strategy_version_sql = IF(
  @version_signal_kind_pre = 1,
  'ALTER TABLE `strategy_versions` ADD COLUMN `signal_kind` enum(''entry'',''exit'') NOT NULL AFTER `rule`',
  'SELECT 1 AS strategy_version_signal_kind_exists'
);
PREPARE stmt FROM @evolve_strategy_version_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @evolve_strategy_signal_sql = IF(
  @signal_pre = 1,
  'ALTER TABLE `strategy_signals` DROP INDEX `idx_strategy_signals_security_time`, DROP COLUMN `security_code`, ADD COLUMN `security_id` int NOT NULL AFTER `strategy_version_id`, ADD COLUMN `signal_kind` enum(''entry'',''exit'') NOT NULL AFTER `signal_source`, ADD KEY `idx_strategy_signals_security_time` (`security_id`,`signal_time`), ADD CONSTRAINT `fk_strategy_signals_security` FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1 AS strategy_signal_identity_exists'
);
PREPARE stmt FROM @evolve_strategy_signal_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @strategy_contract_post_columns = (
  SELECT COUNT(*) = 3
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND (
      (`TABLE_NAME` = 'strategy_versions' AND `COLUMN_NAME` = 'signal_kind'
        AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')' AND `IS_NULLABLE` = 'NO'
        AND `COLUMN_DEFAULT` IS NULL) OR
      (`TABLE_NAME` = 'strategy_signals' AND `COLUMN_NAME` = 'security_id'
        AND `COLUMN_TYPE` = 'int' AND `IS_NULLABLE` = 'NO'
        AND `COLUMN_DEFAULT` IS NULL) OR
      (`TABLE_NAME` = 'strategy_signals' AND `COLUMN_NAME` = 'signal_kind'
        AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')' AND `IS_NULLABLE` = 'NO'
        AND `COLUMN_DEFAULT` IS NULL)
    )
);

SET @strategy_contract_retired_column_count = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `COLUMN_NAME` = 'security_code'
);

SET @strategy_contract_post_index = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'strategy_signals'
    AND `INDEX_NAME` = 'idx_strategy_signals_security_time'
    AND `NON_UNIQUE` = 1
    AND (
      (`SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'security_id') OR
      (`SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'signal_time')
    )
);

SET @strategy_contract_post_fk = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`KEY_COLUMN_USAGE` AS `usage_rows`
  JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `references_rows`
    ON `references_rows`.`CONSTRAINT_SCHEMA` = `usage_rows`.`CONSTRAINT_SCHEMA`
    AND `references_rows`.`TABLE_NAME` = `usage_rows`.`TABLE_NAME`
    AND `references_rows`.`CONSTRAINT_NAME` = `usage_rows`.`CONSTRAINT_NAME`
  WHERE `usage_rows`.`CONSTRAINT_SCHEMA` = DATABASE()
    AND `usage_rows`.`TABLE_NAME` = 'strategy_signals'
    AND `usage_rows`.`CONSTRAINT_NAME` = 'fk_strategy_signals_security'
    AND `usage_rows`.`COLUMN_NAME` = 'security_id'
    AND `usage_rows`.`REFERENCED_TABLE_NAME` = 'securities'
    AND `usage_rows`.`REFERENCED_COLUMN_NAME` = 'id'
    AND `references_rows`.`DELETE_RULE` = 'RESTRICT'
    AND `references_rows`.`UPDATE_RULE` = 'RESTRICT'
);

SET @assert_strategy_contract_post_sql = IF(
  @strategy_contract_post_columns = 1 AND
  @strategy_contract_retired_column_count = 0 AND
  @strategy_contract_post_index = 1 AND
  @strategy_contract_post_fk = 1,
  'SELECT 1 AS strategy_evaluation_contract_postflight_ready',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Strategy evaluation migration postflight did not reach the exact target schema'''
);
PREPARE stmt FROM @assert_strategy_contract_post_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
