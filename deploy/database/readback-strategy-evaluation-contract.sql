-- Read-only post-migration contract. Every *_ready value must be 1, retired
-- security_code count must be 0, and no unapproved Signal unique key may exist.

SELECT
  (
    SELECT COUNT(*) = 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_versions'
      AND `COLUMN_NAME` = 'signal_kind'
      AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')'
      AND `IS_NULLABLE` = 'NO'
      AND `COLUMN_DEFAULT` IS NULL
  ) AS `strategy_version_signal_kind_ready`,
  (
    SELECT COUNT(*) = 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_signals'
      AND `COLUMN_NAME` = 'security_id'
      AND `COLUMN_TYPE` = 'int'
      AND `IS_NULLABLE` = 'NO'
      AND `COLUMN_DEFAULT` IS NULL
  ) AS `strategy_signal_security_id_ready`,
  (
    SELECT COUNT(*) = 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_signals'
      AND `COLUMN_NAME` = 'signal_kind'
      AND `COLUMN_TYPE` = 'enum(''entry'',''exit'')'
      AND `IS_NULLABLE` = 'NO'
      AND `COLUMN_DEFAULT` IS NULL
  ) AS `strategy_signal_kind_ready`,
  (
    SELECT COUNT(*)
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_signals'
      AND `COLUMN_NAME` = 'security_code'
  ) AS `retired_security_code_count`,
  (
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
  ) AS `strategy_signal_security_index_ready`,
  (
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
  ) AS `strategy_signal_security_fk_ready`,
  (
    SELECT COUNT(*) = 1
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_alert_events'
      AND `INDEX_NAME` = 'uq_strategy_alert_events_dedupe_key'
      AND `NON_UNIQUE` = 0
      AND `SEQ_IN_INDEX` = 1
      AND `COLUMN_NAME` = 'dedupe_key'
  ) AS `alert_dedupe_unique_ready`,
  (
    SELECT COUNT(*)
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'strategy_signals'
      AND `NON_UNIQUE` = 0
      AND `INDEX_NAME` <> 'PRIMARY'
  ) AS `unapproved_signal_unique_count`;

SELECT `version`, `applied_at`
FROM `schema_migrations`
WHERE `version` = '014_evolve_strategy_evaluation_contract.sql';

SHOW CREATE TABLE `strategy_versions`;
SHOW CREATE TABLE `strategy_signals`;
