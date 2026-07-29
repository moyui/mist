-- Read-only inventory for Chan result tables that are no longer application
-- persistence targets. This script does not create, alter, truncate, or drop
-- anything.
--
-- `information_schema.tables.table_rows` is approximate for InnoDB. Run the
-- generated exact-count and SHOW CREATE TABLE statements for every present
-- table and retain their output before proposing physical removal.

SELECT
  `expected`.`table_name`,
  CASE
    WHEN `actual`.`table_name` IS NULL THEN 'absent'
    ELSE 'present'
  END AS `table_status`,
  `actual`.`table_rows` AS `approximate_row_count`
FROM (
  SELECT 'chan_bis' AS `table_name`
  UNION ALL SELECT 'chan_fenxings'
  UNION ALL SELECT 'chan_index_periods'
  UNION ALL SELECT 'chan_states'
) AS `expected`
LEFT JOIN `information_schema`.`tables` AS `actual`
  ON `actual`.`table_schema` = DATABASE()
  AND `actual`.`table_name` = `expected`.`table_name`
ORDER BY `expected`.`table_name`;

SELECT
  CONCAT(
    'SELECT ''',
    `table_name`,
    ''' AS table_name, COUNT(*) AS exact_row_count FROM `',
    REPLACE(`table_name`, '`', '``'),
    '`;'
  ) AS `exact_count_sql`,
  CONCAT(
    'SHOW CREATE TABLE `',
    REPLACE(`table_name`, '`', '``'),
    '`;'
  ) AS `capture_ddl_sql`
FROM `information_schema`.`tables`
WHERE `table_schema` = DATABASE()
  AND `table_name` IN (
    'chan_bis',
    'chan_fenxings',
    'chan_index_periods',
    'chan_states'
  )
ORDER BY `table_name`;
