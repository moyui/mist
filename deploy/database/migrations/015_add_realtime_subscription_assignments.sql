-- Production preflight on 2026-08-04 proved migrations 001-014, the exact
-- securities/security_source_configs schema and no existing assignment table.
-- This migration is additive and accepts only the exact pre, known partial, or
-- exact post state so MySQL per-table DDL can be repaired forward by rerun.

SET @realtime_source_base_columns = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND (
      (`COLUMN_NAME` = 'id' AND `COLUMN_TYPE` = 'int' AND `IS_NULLABLE` = 'NO') OR
      (`COLUMN_NAME` = 'security_id' AND `COLUMN_TYPE` = 'int' AND `IS_NULLABLE` = 'NO')
    )
);

SET @realtime_source_identity_unique_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND `INDEX_NAME` = 'uq_security_source_configs_id_security'
);

SET @realtime_source_identity_unique_post = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND `INDEX_NAME` = 'uq_security_source_configs_id_security'
    AND `NON_UNIQUE` = 0
    AND (
      (`SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'id') OR
      (`SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'security_id')
    )
);

SET @realtime_source_lookup_index_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND `INDEX_NAME` = 'idx_security_source_configs_source'
);

SET @realtime_source_lookup_index_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND `INDEX_NAME` = 'idx_security_source_configs_source'
    AND `NON_UNIQUE` = 1
    AND `SEQ_IN_INDEX` = 1
    AND `COLUMN_NAME` = 'source'
);

SET @realtime_assignment_table_absent = (
  SELECT COUNT(*) = 0
  FROM `information_schema`.`TABLES`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'realtime_subscription_assignments'
);

SET @realtime_assignment_columns_post = (
  SELECT COUNT(*) = 5
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'realtime_subscription_assignments'
    AND (
      (`COLUMN_NAME` = 'id' AND `ORDINAL_POSITION` = 1 AND `COLUMN_TYPE` = 'int'
        AND `IS_NULLABLE` = 'NO' AND `EXTRA` = 'auto_increment') OR
      (`COLUMN_NAME` = 'security_id' AND `ORDINAL_POSITION` = 2 AND `COLUMN_TYPE` = 'int'
        AND `IS_NULLABLE` = 'NO' AND `COLUMN_DEFAULT` IS NULL) OR
      (`COLUMN_NAME` = 'source_config_id' AND `ORDINAL_POSITION` = 3 AND `COLUMN_TYPE` = 'int'
        AND `IS_NULLABLE` = 'NO' AND `COLUMN_DEFAULT` IS NULL) OR
      (`COLUMN_NAME` = 'created_at' AND `ORDINAL_POSITION` = 4 AND `COLUMN_TYPE` = 'datetime(6)'
        AND `IS_NULLABLE` = 'NO' AND `COLUMN_DEFAULT` = 'CURRENT_TIMESTAMP(6)') OR
      (`COLUMN_NAME` = 'updated_at' AND `ORDINAL_POSITION` = 5 AND `COLUMN_TYPE` = 'datetime(6)'
        AND `IS_NULLABLE` = 'NO' AND `COLUMN_DEFAULT` = 'CURRENT_TIMESTAMP(6)'
        AND `EXTRA` = 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)')
    )
);

SET @realtime_assignment_exact_column_count = (
  SELECT COUNT(*) = 5
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'realtime_subscription_assignments'
);

SET @realtime_assignment_indexes_post = (
  SELECT COUNT(*) = 5
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'realtime_subscription_assignments'
    AND (
      (`INDEX_NAME` = 'PRIMARY' AND `NON_UNIQUE` = 0 AND `SEQ_IN_INDEX` = 1
        AND `COLUMN_NAME` = 'id') OR
      (`INDEX_NAME` = 'uq_realtime_subscription_assignments_security' AND `NON_UNIQUE` = 0
        AND `SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'security_id') OR
      (`INDEX_NAME` = 'uq_realtime_subscription_assignments_source_config' AND `NON_UNIQUE` = 0
        AND `SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'source_config_id') OR
      (`INDEX_NAME` = 'idx_realtime_subscription_assignments_source_security' AND `NON_UNIQUE` = 1
        AND `SEQ_IN_INDEX` = 1 AND `COLUMN_NAME` = 'source_config_id') OR
      (`INDEX_NAME` = 'idx_realtime_subscription_assignments_source_security' AND `NON_UNIQUE` = 1
        AND `SEQ_IN_INDEX` = 2 AND `COLUMN_NAME` = 'security_id')
    )
);

SET @realtime_assignment_security_fk_post = (
  SELECT COUNT(*) = 1
  FROM `information_schema`.`KEY_COLUMN_USAGE` AS `usage_rows`
  JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `reference_rows`
    ON `reference_rows`.`CONSTRAINT_SCHEMA` = `usage_rows`.`CONSTRAINT_SCHEMA`
    AND `reference_rows`.`TABLE_NAME` = `usage_rows`.`TABLE_NAME`
    AND `reference_rows`.`CONSTRAINT_NAME` = `usage_rows`.`CONSTRAINT_NAME`
  WHERE `usage_rows`.`CONSTRAINT_SCHEMA` = DATABASE()
    AND `usage_rows`.`TABLE_NAME` = 'realtime_subscription_assignments'
    AND `usage_rows`.`CONSTRAINT_NAME` = 'fk_realtime_subscription_assignments_security'
    AND `usage_rows`.`COLUMN_NAME` = 'security_id'
    AND `usage_rows`.`REFERENCED_TABLE_NAME` = 'securities'
    AND `usage_rows`.`REFERENCED_COLUMN_NAME` = 'id'
    AND `reference_rows`.`DELETE_RULE` = 'RESTRICT'
    AND `reference_rows`.`UPDATE_RULE` = 'RESTRICT'
);

SET @realtime_assignment_source_fk_post = (
  SELECT COUNT(*) = 2
  FROM `information_schema`.`KEY_COLUMN_USAGE` AS `usage_rows`
  JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `reference_rows`
    ON `reference_rows`.`CONSTRAINT_SCHEMA` = `usage_rows`.`CONSTRAINT_SCHEMA`
    AND `reference_rows`.`TABLE_NAME` = `usage_rows`.`TABLE_NAME`
    AND `reference_rows`.`CONSTRAINT_NAME` = `usage_rows`.`CONSTRAINT_NAME`
  WHERE `usage_rows`.`CONSTRAINT_SCHEMA` = DATABASE()
    AND `usage_rows`.`TABLE_NAME` = 'realtime_subscription_assignments'
    AND `usage_rows`.`CONSTRAINT_NAME` = 'fk_realtime_subscription_assignments_source_config'
    AND `usage_rows`.`REFERENCED_TABLE_NAME` = 'security_source_configs'
    AND `reference_rows`.`DELETE_RULE` = 'RESTRICT'
    AND `reference_rows`.`UPDATE_RULE` = 'RESTRICT'
    AND (
      (`usage_rows`.`ORDINAL_POSITION` = 1 AND `usage_rows`.`COLUMN_NAME` = 'source_config_id'
        AND `usage_rows`.`REFERENCED_COLUMN_NAME` = 'id') OR
      (`usage_rows`.`ORDINAL_POSITION` = 2 AND `usage_rows`.`COLUMN_NAME` = 'security_id'
        AND `usage_rows`.`REFERENCED_COLUMN_NAME` = 'security_id')
    )
);

SET @realtime_assignment_post = (
  @realtime_assignment_columns_post = 1 AND
  @realtime_assignment_exact_column_count = 1 AND
  @realtime_assignment_indexes_post = 1 AND
  @realtime_assignment_security_fk_post = 1 AND
  @realtime_assignment_source_fk_post = 1
);

SET @realtime_assignment_known_state = (
  @realtime_source_base_columns = 1 AND (
    (@realtime_source_identity_unique_absent = 1 AND
      @realtime_source_lookup_index_absent = 1 AND
      @realtime_assignment_table_absent = 1) OR
    (@realtime_source_identity_unique_post = 1 AND
      @realtime_source_lookup_index_post = 1 AND
      @realtime_assignment_table_absent = 1) OR
    (@realtime_source_identity_unique_post = 1 AND
      @realtime_source_lookup_index_post = 1 AND
      @realtime_assignment_post = 1)
  )
);

SET @assert_realtime_assignment_sql = IF(
  @realtime_assignment_known_state = 1,
  'SELECT 1 AS realtime_assignment_preflight_ready',
  'SELECT * FROM `realtime_assignment_migration_requires_exact_known_schema_state`'
);
PREPARE stmt FROM @assert_realtime_assignment_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_realtime_source_identity_unique_sql = IF(
  @realtime_source_identity_unique_absent = 1,
  'ALTER TABLE `security_source_configs` ADD UNIQUE KEY `uq_security_source_configs_id_security` (`id`,`security_id`), ADD KEY `idx_security_source_configs_source` (`source`)',
  'SELECT 1 AS realtime_source_identity_unique_exists'
);
PREPARE stmt FROM @add_realtime_source_identity_unique_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `realtime_subscription_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `security_id` int NOT NULL,
  `source_config_id` int NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_realtime_subscription_assignments_security` (`security_id`),
  UNIQUE KEY `uq_realtime_subscription_assignments_source_config` (`source_config_id`),
  KEY `idx_realtime_subscription_assignments_source_security` (`source_config_id`,`security_id`),
  CONSTRAINT `fk_realtime_subscription_assignments_security`
    FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_realtime_subscription_assignments_source_config`
    FOREIGN KEY (`source_config_id`,`security_id`)
    REFERENCES `security_source_configs` (`id`,`security_id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @realtime_assignment_postflight = (
  SELECT
    (SELECT COUNT(*) = 5 FROM `information_schema`.`COLUMNS`
      WHERE `TABLE_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'realtime_subscription_assignments') AND
    (SELECT COUNT(*) = 2 FROM `information_schema`.`STATISTICS`
      WHERE `TABLE_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'security_source_configs'
        AND `INDEX_NAME` = 'uq_security_source_configs_id_security'
        AND `NON_UNIQUE` = 0) AND
    (SELECT COUNT(*) = 1 FROM `information_schema`.`STATISTICS`
      WHERE `TABLE_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'security_source_configs'
        AND `INDEX_NAME` = 'idx_security_source_configs_source'
        AND `NON_UNIQUE` = 1
        AND `SEQ_IN_INDEX` = 1
        AND `COLUMN_NAME` = 'source') AND
    (SELECT COUNT(*) = 5 FROM `information_schema`.`STATISTICS`
      WHERE `TABLE_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'realtime_subscription_assignments') AND
    (SELECT COUNT(*) = 4 FROM `information_schema`.`TABLE_CONSTRAINTS`
      WHERE `CONSTRAINT_SCHEMA` = DATABASE()
        AND `TABLE_NAME` = 'realtime_subscription_assignments'
        AND `CONSTRAINT_NAME` IN (
          'uq_realtime_subscription_assignments_security',
          'uq_realtime_subscription_assignments_source_config',
          'fk_realtime_subscription_assignments_security',
          'fk_realtime_subscription_assignments_source_config'
        ))
);

SET @assert_realtime_assignment_post_sql = IF(
  @realtime_assignment_postflight = 1,
  'SELECT 1 AS realtime_assignment_postflight_ready',
  'SELECT * FROM `realtime_assignment_migration_postflight_schema_mismatch`'
);
PREPARE stmt FROM @assert_realtime_assignment_post_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
