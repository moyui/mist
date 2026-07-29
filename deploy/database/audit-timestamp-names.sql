-- Read-only persistent-data audit for
-- 011_normalize_audit_timestamp_names.sql.
-- Run before and after migration 011. The script creates only a temporary
-- session table and does not modify application data.

DROP TEMPORARY TABLE IF EXISTS `expected_audit_timestamp_renames`;
CREATE TEMPORARY TABLE `expected_audit_timestamp_renames` (
  `table_name` varchar(64) NOT NULL,
  `old_column_name` varchar(64) NOT NULL,
  `new_column_name` varchar(64) NOT NULL,
  `audit_role` enum('created', 'updated') NOT NULL,
  PRIMARY KEY (`table_name`, `old_column_name`, `new_column_name`)
);

INSERT INTO `expected_audit_timestamp_renames`
  (`table_name`, `old_column_name`, `new_column_name`, `audit_role`)
VALUES
  ('security_source_configs', 'create_time', 'created_at', 'created'),
  ('security_source_configs', 'update_time', 'updated_at', 'updated'),
  ('k', 'create_time', 'created_at', 'created'),
  ('k', 'update_time', 'updated_at', 'updated'),
  ('k_extensions_ef', 'create_time', 'created_at', 'created'),
  ('k_extensions_ef', 'update_time', 'updated_at', 'updated'),
  ('k_extensions_tdx', 'create_time', 'created_at', 'created'),
  ('k_extensions_tdx', 'update_time', 'updated_at', 'updated'),
  ('k_extensions_qmt', 'create_time', 'created_at', 'created'),
  ('k_extensions_qmt', 'update_time', 'updated_at', 'updated');

SELECT
  `expected`.`table_name`,
  `expected`.`old_column_name`,
  `expected`.`new_column_name`,
  `expected`.`audit_role`,
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
  END AS `migration_state`,
  CASE
    WHEN COALESCE(`new_column`.`data_type`, `old_column`.`data_type`) <> 'datetime'
      OR COALESCE(
        `new_column`.`datetime_precision`,
        `old_column`.`datetime_precision`
      ) <> 6
      OR COALESCE(`new_column`.`is_nullable`, `old_column`.`is_nullable`) <> 'NO'
      OR UPPER(
        COALESCE(`new_column`.`column_default`, `old_column`.`column_default`, '')
      ) NOT LIKE 'CURRENT_TIMESTAMP%'
      OR (
        `expected`.`audit_role` = 'updated'
        AND LOWER(COALESCE(`new_column`.`extra`, `old_column`.`extra`, ''))
          NOT LIKE '%on update current_timestamp%'
      )
      THEN 'invalid'
    ELSE 'valid'
  END AS `attribute_state`
FROM `expected_audit_timestamp_renames` AS `expected`
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
  `expected`.`audit_role`;

SELECT
  SUM(`old_column`.`column_name` IS NOT NULL) AS `old_column_count`,
  SUM(`new_column`.`column_name` IS NOT NULL) AS `new_column_count`,
  SUM(
    (`old_column`.`column_name` IS NULL)
      = (`new_column`.`column_name` IS NULL)
  ) AS `invalid_mapping_count`,
  SUM(
    COALESCE(`new_column`.`data_type`, `old_column`.`data_type`) <> 'datetime'
    OR COALESCE(
      `new_column`.`datetime_precision`,
      `old_column`.`datetime_precision`
    ) <> 6
    OR COALESCE(`new_column`.`is_nullable`, `old_column`.`is_nullable`) <> 'NO'
    OR UPPER(
      COALESCE(`new_column`.`column_default`, `old_column`.`column_default`, '')
    ) NOT LIKE 'CURRENT_TIMESTAMP%'
    OR (
      `expected`.`audit_role` = 'updated'
      AND LOWER(COALESCE(`new_column`.`extra`, `old_column`.`extra`, ''))
        NOT LIKE '%on update current_timestamp%'
    )
  ) AS `invalid_attribute_count`
FROM `expected_audit_timestamp_renames` AS `expected`
LEFT JOIN `information_schema`.`columns` AS `old_column`
  ON `old_column`.`table_schema` = DATABASE()
  AND `old_column`.`table_name` = `expected`.`table_name`
  AND BINARY `old_column`.`column_name` = BINARY `expected`.`old_column_name`
LEFT JOIN `information_schema`.`columns` AS `new_column`
  ON `new_column`.`table_schema` = DATABASE()
  AND `new_column`.`table_name` = `expected`.`table_name`
  AND BINARY `new_column`.`column_name` = BINARY `expected`.`new_column_name`;

-- The post-migration result set must be empty for the complete managed schema.
SELECT
  `table_name`,
  `column_name`
FROM `information_schema`.`columns`
WHERE `table_schema` = DATABASE()
  AND `table_name` IN (
    'securities',
    'security_source_configs',
    'k',
    'k_extensions_ef',
    'k_extensions_tdx',
    'k_extensions_qmt',
    'strategy_definitions',
    'strategy_versions',
    'strategy_signals',
    'strategy_alert_events',
    'backtest_runs',
    'backtest_signal_results'
  )
  AND `column_name` IN ('create_time', 'update_time')
ORDER BY `table_name`, `ordinal_position`;

DROP TEMPORARY TABLE `expected_audit_timestamp_renames`;
