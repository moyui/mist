-- Read-only audit for migration 013_remove_qmt_native_period.sql.
-- Before migration, column_count must be 1. After migration, it must be 0.

SELECT COUNT(*) AS `native_period_column_count`
FROM `information_schema`.`columns`
WHERE `table_schema` = DATABASE()
  AND `table_name` = 'k_extensions_qmt'
  AND BINARY `column_name` = BINARY 'native_period';
