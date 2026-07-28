-- Run before deploying the provider-symbol fail-closed application.
-- Both result sets must be empty before release.

SELECT
  `id`,
  `security_id`,
  `source`,
  `formatCode`,
  `enabled`
FROM `security_source_configs`
WHERE `enabled` = 1
  AND CHAR_LENGTH(TRIM(`formatCode`)) = 0
ORDER BY `source`, `security_id`;

SELECT
  `id`,
  `security_id`,
  `source`,
  `formatCode`,
  `enabled`
FROM `security_source_configs`
WHERE `enabled` = 1
  AND `source` IN ('tdx', 'qmt')
  AND TRIM(`formatCode`) NOT REGEXP '^[0-9]{6}\\.(SH|SZ|BJ)$'
ORDER BY `source`, `security_id`;
