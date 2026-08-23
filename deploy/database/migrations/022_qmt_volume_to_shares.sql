-- Convert QMT historical volume from provider-native lots to canonical shares.
--
-- Unit contract (extract-backtest-runtime quantity profile): the `k` table
-- stores canonical units for every source — volume in shares, amount in CNY
-- yuan. TDX amount was already canonicalized at the write layer and by
-- migration 019; this migration completes the same contract for QMT volume
-- (手 → 股, exact fixed-point ×100). After this migration the read-side mapper
-- (mapKToStrategyBar) performs no source-specific scaling.
--
-- Forward-only, additive (no schema change). Existing QMT rows were written
-- with raw provider lots; multiply them by 100 to canonical shares. Zero and
-- NULL are left untouched (0 lots = 0 shares; NULL stays NULL).
UPDATE `k`
SET `volume` = `volume` * 100
WHERE `source` = 'qmt'
  AND `volume` IS NOT NULL
  AND `volume` <> 0;
