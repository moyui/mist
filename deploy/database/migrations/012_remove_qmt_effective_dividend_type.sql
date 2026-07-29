-- Remove redundant per-bar request provenance.
-- QMT dividend_type is a backend-owned request parameter and is not returned
-- by the provider as an independently verified applied value.

ALTER TABLE `k_extensions_qmt`
  DROP COLUMN `effective_dividend_type`;
