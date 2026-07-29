-- Remove redundant per-bar request-period provenance.
-- The authoritative domain period remains k.period; the QMT request string is
-- derived by PeriodMappingService and is not returned as independent evidence.

ALTER TABLE `k_extensions_qmt`
  DROP COLUMN `native_period`;
