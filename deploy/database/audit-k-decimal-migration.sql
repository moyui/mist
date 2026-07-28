-- Run before and after 007_k_volume_amount_exact_decimal.sql.
-- Preserve both result sets with the release evidence.

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'k'
  AND COLUMN_NAME IN ('volume', 'amount')
ORDER BY COLUMN_NAME;

SELECT
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH,
  DATA_FREE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'k';

SELECT
  `source`,
  COUNT(*) AS row_count,
  SUM(`volume` IS NULL) AS null_volume_count,
  SUM(`amount` IS NULL) AS null_amount_count,
  MIN(`volume`) AS min_volume,
  MAX(`volume`) AS max_volume,
  SUM(`volume`) AS volume_sum,
  MIN(`amount`) AS min_amount,
  MAX(`amount`) AS max_amount,
  SUM(`amount`) AS amount_sum,
  BIT_XOR(
    CRC32(
      CONCAT_WS(
        '#',
        `id`,
        `securityId`,
        `source`,
        `period`,
        DATE_FORMAT(`timestamp`, '%Y-%m-%d %H:%i:%s'),
        CAST(CAST(`volume` AS decimal(36,8)) AS CHAR),
        CAST(CAST(`amount` AS decimal(36,8)) AS CHAR)
      )
    )
  ) AS normalized_row_digest
FROM `k`
GROUP BY `source`
ORDER BY `source`;
