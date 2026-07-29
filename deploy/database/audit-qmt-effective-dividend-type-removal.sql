-- Read-only audit for migration 012_remove_qmt_effective_dividend_type.sql.
-- Before migration, column_count must be 1. After migration, it must be 0.

SELECT COUNT(*) AS `effective_dividend_type_column_count`
FROM `information_schema`.`columns`
WHERE `table_schema` = DATABASE()
  AND `table_name` = 'k_extensions_qmt'
  AND BINARY `column_name` = BINARY 'effective_dividend_type';
