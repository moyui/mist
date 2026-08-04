-- Backtest runtime schema gate for extract-backtest-runtime.
-- Production preflight on 2026-08-05 proved backtest_runs/backtest_signal_results
-- have zero rows, the unique constraint uq_backtest_signal_results_run_security_time
-- already exists (created by 009), and only target_issues + the pagination index
-- are missing. This migration is forward-only and purely additive.

ALTER TABLE `backtest_runs`
  ADD COLUMN `target_issues` JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER `target_universe`;

CREATE INDEX `idx_backtest_signal_results_run_time_id`
  ON `backtest_signal_results` (`backtest_run_id`, `signal_time`, `id`);
