ALTER TABLE `security_source_configs`
  RENAME COLUMN `create_time` TO `created_at`,
  RENAME COLUMN `update_time` TO `updated_at`;

ALTER TABLE `k`
  RENAME COLUMN `create_time` TO `created_at`,
  RENAME COLUMN `update_time` TO `updated_at`;

ALTER TABLE `k_extensions_ef`
  RENAME COLUMN `create_time` TO `created_at`,
  RENAME COLUMN `update_time` TO `updated_at`;

ALTER TABLE `k_extensions_tdx`
  RENAME COLUMN `create_time` TO `created_at`,
  RENAME COLUMN `update_time` TO `updated_at`;

ALTER TABLE `k_extensions_qmt`
  RENAME COLUMN `create_time` TO `created_at`,
  RENAME COLUMN `update_time` TO `updated_at`;
