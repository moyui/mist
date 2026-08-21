-- Add strategy kind to strategy_definitions: selects rule semantics.
-- Forward-only, additive. Existing rows default to 'rule_dsl' (unchanged
-- behavior). 'chan_bsp' selects the Chan buy/sell point configuration
-- (add-chan-bsp-realtime-evaluation).
ALTER TABLE `strategy_definitions`
  ADD COLUMN `kind` ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl' AFTER `status`;
