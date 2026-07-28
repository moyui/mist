-- Remove the unused and semantically inconsistent third security-code field.
-- Provider routing remains owned by security_source_configs.formatCode and
-- completed K ownership remains keyed by k.security_id.

ALTER TABLE `k_extensions_tdx`
  DROP COLUMN `fullCode`;

ALTER TABLE `k_extensions_qmt`
  DROP COLUMN `fullCode`;

ALTER TABLE `k_extensions_ef`
  DROP COLUMN `fullCode`;
