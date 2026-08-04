SELECT COUNT(*) = 1 AS `migration_015_recorded`
FROM `schema_migrations`
WHERE `version` = '015_add_realtime_subscription_assignments.sql';

SELECT COUNT(*) = 5 AS `assignment_columns_ready`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'realtime_subscription_assignments';

SELECT COUNT(*) = 2 AS `source_identity_unique_ready`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'security_source_configs'
  AND `INDEX_NAME` = 'uq_security_source_configs_id_security'
  AND `NON_UNIQUE` = 0;

SELECT COUNT(*) = 1 AS `source_lookup_index_ready`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'security_source_configs'
  AND `INDEX_NAME` = 'idx_security_source_configs_source'
  AND `NON_UNIQUE` = 1
  AND `SEQ_IN_INDEX` = 1
  AND `COLUMN_NAME` = 'source';

SELECT COUNT(*) = 5 AS `assignment_indexes_ready`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'realtime_subscription_assignments';

SELECT COUNT(*) = 4 AS `assignment_named_constraints_ready`
FROM `information_schema`.`TABLE_CONSTRAINTS`
WHERE `CONSTRAINT_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'realtime_subscription_assignments'
  AND `CONSTRAINT_NAME` IN (
    'uq_realtime_subscription_assignments_security',
    'uq_realtime_subscription_assignments_source_config',
    'fk_realtime_subscription_assignments_security',
    'fk_realtime_subscription_assignments_source_config'
  );

SELECT COUNT(*) AS `assignment_count`
FROM `realtime_subscription_assignments`;

SELECT COUNT(*) AS `orphan_or_cross_security_assignment_count`
FROM `realtime_subscription_assignments` AS `assignment`
LEFT JOIN `securities` AS `security`
  ON `security`.`id` = `assignment`.`security_id`
LEFT JOIN `security_source_configs` AS `source_config`
  ON `source_config`.`id` = `assignment`.`source_config_id`
  AND `source_config`.`security_id` = `assignment`.`security_id`
WHERE `security`.`id` IS NULL OR `source_config`.`id` IS NULL;

SELECT COUNT(*) AS `ineligible_assignment_count`
FROM `realtime_subscription_assignments` AS `assignment`
JOIN `securities` AS `security`
  ON `security`.`id` = `assignment`.`security_id`
JOIN `security_source_configs` AS `source_config`
  ON `source_config`.`id` = `assignment`.`source_config_id`
  AND `source_config`.`security_id` = `assignment`.`security_id`
WHERE `security`.`type` <> 'STOCK'
   OR `source_config`.`enabled` <> 1
   OR `source_config`.`source` NOT IN ('tdx', 'qmt');

SELECT `source_config`.`source`, COUNT(*) AS `active_assignment_count`
FROM `realtime_subscription_assignments` AS `assignment`
JOIN `securities` AS `security`
  ON `security`.`id` = `assignment`.`security_id`
JOIN `security_source_configs` AS `source_config`
  ON `source_config`.`id` = `assignment`.`source_config_id`
  AND `source_config`.`security_id` = `assignment`.`security_id`
WHERE `security`.`status` = 1
GROUP BY `source_config`.`source`
ORDER BY `source_config`.`source`;
