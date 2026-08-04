SELECT `version`, `applied_at`
FROM `schema_migrations`
ORDER BY `version`;

SELECT `TABLE_NAME`, `ENGINE`, `TABLE_COLLATION`
FROM `information_schema`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'securities',
    'security_source_configs',
    'realtime_subscription_assignments'
  )
ORDER BY `TABLE_NAME`;

SELECT `TABLE_NAME`, `ORDINAL_POSITION`, `COLUMN_NAME`, `COLUMN_TYPE`,
       `IS_NULLABLE`, `COLUMN_DEFAULT`, `EXTRA`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'securities',
    'security_source_configs',
    'realtime_subscription_assignments'
  )
ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`;

SELECT `TABLE_NAME`, `INDEX_NAME`, `NON_UNIQUE`, `SEQ_IN_INDEX`, `COLUMN_NAME`
FROM `information_schema`.`STATISTICS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'securities',
    'security_source_configs',
    'realtime_subscription_assignments'
  )
ORDER BY `TABLE_NAME`, `INDEX_NAME`, `SEQ_IN_INDEX`;

SELECT `TABLE_NAME`, `CONSTRAINT_NAME`, `CONSTRAINT_TYPE`
FROM `information_schema`.`TABLE_CONSTRAINTS`
WHERE `CONSTRAINT_SCHEMA` = DATABASE()
  AND `TABLE_NAME` IN (
    'securities',
    'security_source_configs',
    'realtime_subscription_assignments'
  )
ORDER BY `TABLE_NAME`, `CONSTRAINT_NAME`;

SELECT `usage_rows`.`TABLE_NAME`, `usage_rows`.`CONSTRAINT_NAME`,
       `usage_rows`.`ORDINAL_POSITION`, `usage_rows`.`COLUMN_NAME`,
       `usage_rows`.`REFERENCED_TABLE_NAME`, `usage_rows`.`REFERENCED_COLUMN_NAME`,
       `reference_rows`.`DELETE_RULE`, `reference_rows`.`UPDATE_RULE`
FROM `information_schema`.`KEY_COLUMN_USAGE` AS `usage_rows`
JOIN `information_schema`.`REFERENTIAL_CONSTRAINTS` AS `reference_rows`
  ON `reference_rows`.`CONSTRAINT_SCHEMA` = `usage_rows`.`CONSTRAINT_SCHEMA`
  AND `reference_rows`.`TABLE_NAME` = `usage_rows`.`TABLE_NAME`
  AND `reference_rows`.`CONSTRAINT_NAME` = `usage_rows`.`CONSTRAINT_NAME`
WHERE `usage_rows`.`CONSTRAINT_SCHEMA` = DATABASE()
  AND `usage_rows`.`TABLE_NAME` IN (
    'security_source_configs',
    'realtime_subscription_assignments'
  )
ORDER BY `usage_rows`.`TABLE_NAME`, `usage_rows`.`CONSTRAINT_NAME`,
         `usage_rows`.`ORDINAL_POSITION`;

SELECT `type`, `status`, COUNT(*) AS `security_count`
FROM `securities`
GROUP BY `type`, `status`
ORDER BY `type`, `status`;

SELECT `source`, `enabled`, COUNT(*) AS `source_config_count`
FROM `security_source_configs`
GROUP BY `source`, `enabled`
ORDER BY `source`, `enabled`;
