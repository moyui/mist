-- Audit for migration 018: strategy_alert_deliveries (deliver-strategy-notifications).
-- Read-only. Run after applying 018 to confirm schema + readback.
-- Usage: mysql -h <host> -P <port> -u <user> -p <database> < deploy/database/audit-strategy-alert-deliveries.sql

-- 1. Table exists with expected shape (columns + types + nullability).
SHOW CREATE TABLE strategy_alert_deliveries;

-- 2. Unique constraint on (event x channel) is present (idempotent fan-out relies on it).
SELECT INDEX_NAME, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'strategy_alert_deliveries'
  AND COLUMN_NAME IN ('strategy_alert_event_id', 'channel')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 3. FK to strategy_alert_events with ON DELETE CASCADE.
SELECT CONSTRAINT_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'strategy_alert_deliveries'
  AND REFERENCED_TABLE_NAME = 'strategy_alert_events';

-- 4. Readback: row count by status (empty right after migration; grows as the
--    notification worker processes AlertEvents).
SELECT status, COUNT(*) AS n
FROM strategy_alert_deliveries
GROUP BY status;
