-- Extend strategy_alert_deliveries.channel ENUM to include Feishu (parity with qq/wechat).
--
-- Producer: notification app `FeishuChannelAdapter` (channel='feishu'); consumer: strategy fanout + OO alert fanout + replay.
-- ENUM widening only (no data rewrite, no FK/index change). Existing rows unchanged; new rows may use 'feishu'.
-- Forward-only, idempotent (safe to re-run). New ENUM value additive by design.
--
-- Preflight:
--   SELECT column_type FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name='strategy_alert_deliveries' AND column_name='channel';
--   -- expect enum('qq','wechat') or enum('qq','wechat','feishu')
-- Postflight / readback:
--   SHOW CREATE TABLE strategy_alert_deliveries; -- channel enum includes 'feishu'
--   SELECT DISTINCT channel FROM strategy_alert_deliveries; -- no orphan values
-- Rollback / compatibility:
--   Old images that do not know 'feishu' will read unknown ENUM as ''/error depending on strictness; do not run
--   `NOTIFICATION_CHANNELS=feishu` against old images — deploy as an atomic version group or repair-forward.

ALTER TABLE `strategy_alert_deliveries`
  MODIFY COLUMN `channel` ENUM('qq','wechat','feishu') NOT NULL;
