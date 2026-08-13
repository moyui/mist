-- Per-channel strategy alert delivery records (deliver-strategy-notifications).
-- Forward-only, additive, idempotent (CREATE TABLE IF NOT EXISTS). Production
-- preflight on 2026-08-12: strategy_alert_deliveries table does not exist yet;
-- authorized by confirmed spec (deliver-strategy-notifications, 2026-08-12).
-- One row per (alert event x channel) so QQ/WeChat fan-out outcomes are recorded
-- independently; AlertEvent status holds the aggregate result.
--
-- Postflight / readback (run audit-strategy-alert-deliveries.sql):
--   SELECT COUNT(*) FROM strategy_alert_deliveries;            -- table readable
--   SHOW CREATE TABLE strategy_alert_deliveries;               -- FK + unique present
-- Repair-forward: additive only; rolling back the image leaves the empty table
--   in place (harmless, no reader on old images). No backfill needed (rows are
--   created lazily by the notification worker as events flow).

CREATE TABLE IF NOT EXISTS `strategy_alert_deliveries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `strategy_alert_event_id` INT NOT NULL,
  `channel` ENUM('qq','wechat') NOT NULL,
  `status` ENUM('pending','sent','failed','dead_lettered') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(1024) NULL,
  `provider_message_id` VARCHAR(255) NULL,
  `sent_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_strategy_alert_deliveries_event_channel` (`strategy_alert_event_id`, `channel`),
  KEY `idx_strategy_alert_deliveries_event` (`strategy_alert_event_id`),
  KEY `idx_strategy_alert_deliveries_status` (`status`),
  CONSTRAINT `fk_strategy_alert_deliveries_event`
    FOREIGN KEY (`strategy_alert_event_id`)
    REFERENCES `strategy_alert_events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
