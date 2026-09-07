-- Migration 024: Add signal confidence, confidence_level, and decision_trace
-- Supports unified whitebox attribution across realtime signals and backtest runs.
-- Expands strategy kind enum to include 'decision_flow'.

-- 1. Expand strategy_definitions.kind
ALTER TABLE `strategy_definitions`
  MODIFY COLUMN `kind` ENUM('rule_dsl','chan_bsp','decision_flow') NOT NULL DEFAULT 'rule_dsl';

-- 2. Expand backtest_runs.kind
ALTER TABLE `backtest_runs`
  MODIFY COLUMN `kind` ENUM('rule_dsl','chan_bsp','decision_flow') NOT NULL DEFAULT 'rule_dsl';

-- 3. Add columns to strategy_signals
ALTER TABLE `strategy_signals`
  ADD COLUMN `confidence` DECIMAL(5,2) NULL DEFAULT NULL AFTER `signal_kind`,
  ADD COLUMN `confidence_level` ENUM('HIGH','MEDIUM','LOW') NULL DEFAULT NULL AFTER `confidence`,
  ADD COLUMN `decision_trace` JSON NULL DEFAULT NULL AFTER `context_snapshot`;

-- 4. Add columns to backtest_signal_results
ALTER TABLE `backtest_signal_results`
  ADD COLUMN `confidence` DECIMAL(5,2) NULL DEFAULT NULL AFTER `signal_time`,
  ADD COLUMN `confidence_level` ENUM('HIGH','MEDIUM','LOW') NULL DEFAULT NULL AFTER `confidence`,
  ADD COLUMN `decision_trace` JSON NULL DEFAULT NULL AFTER `context_snapshot`;
