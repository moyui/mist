-- Fix TDX historical amount unit: provider-native 万元 → canonical yuan.
-- 2026-08-13 backtest quantity HIL finding: k.amount for source='tdx' stores
-- 万元 raw (600519 737346.25 = 73.7亿元). Realtime converter already converts
-- ×10000; the historical write path did not. Forward-only data repair;
-- volume (shares) is untouched. Must apply before backtest cutover (5.6).
UPDATE `k`
  SET `amount` = `amount` * 10000
  WHERE `source` = 'tdx' AND `amount` IS NOT NULL;
