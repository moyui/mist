-- Add strategy kind snapshot to backtest_runs: selects rule semantics for replay.
-- Forward-only, additive. Existing rows default to 'rule_dsl' (unchanged
-- behavior). 'chan_bsp' selects the Chan buy/sell point replay path
-- (add-chan-bsp-backtest-evaluation); captured from strategy_definitions.kind
-- at run creation so replay never depends on the definition's current value.
ALTER TABLE `backtest_runs`
  ADD COLUMN `kind` ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl' AFTER `status`;