-- Apply only after audit-strategy-database-integrity.sql reports zero for
-- every violation count. This migration intentionally performs no data repair.

ALTER TABLE `strategy_versions`
  ADD UNIQUE KEY `uq_strategy_versions_definition_id`
    (`strategy_definition_id`, `id`);

ALTER TABLE `strategy_definitions`
  ADD CONSTRAINT `fk_strategy_definitions_current_version`
    FOREIGN KEY (`id`, `current_version_id`)
    REFERENCES `strategy_versions` (`strategy_definition_id`, `id`)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  ADD CONSTRAINT `chk_strategy_definitions_enabled_version`
    CHECK (`status` <> 'enabled' OR `current_version_id` IS NOT NULL);

ALTER TABLE `strategy_signals`
  MODIFY COLUMN `context_snapshot` json NOT NULL,
  MODIFY COLUMN `rule_snapshot` json NOT NULL;

ALTER TABLE `backtest_signal_results`
  DROP FOREIGN KEY `fk_backtest_signal_results_definition`,
  DROP FOREIGN KEY `fk_backtest_signal_results_version`,
  DROP COLUMN `strategy_definition_id`,
  DROP COLUMN `strategy_version_id`,
  DROP COLUMN `period`,
  DROP COLUMN `source`,
  MODIFY COLUMN `context_snapshot` json NOT NULL,
  MODIFY COLUMN `rule_snapshot` json NOT NULL,
  ADD UNIQUE KEY `uq_backtest_signal_results_run_security_time`
    (`backtest_run_id`, `security_code`, `signal_time`);
