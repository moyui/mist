-- Runtime configs table for declarative-realtime-configuration.
-- Forward-only, additive, idempotent (CREATE TABLE IF NOT EXISTS + guarded
-- seed insert). Production preflight on 2026-08-11: no runtime_configs table
-- exists yet; the one-shot seed row realtime_subscription_auto_reconcile='true'
-- matches production lifecycle_mode=on (one-shot migration per user decision,
-- no progressive phase).

CREATE TABLE IF NOT EXISTS `runtime_configs` (
  `config_key` VARCHAR(128) NOT NULL,
  `config_value` VARCHAR(512) NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_by` VARCHAR(64) NOT NULL DEFAULT '',
  `comment` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `runtime_configs` (`config_key`, `config_value`, `updated_by`, `comment`)
SELECT 'realtime_subscription_auto_reconcile', 'true', 'migration:017',
       'declarative config one-shot (was lifecycle_mode=on)'
WHERE NOT EXISTS (
  SELECT 1 FROM `runtime_configs` WHERE `config_key` = 'realtime_subscription_auto_reconcile'
);
