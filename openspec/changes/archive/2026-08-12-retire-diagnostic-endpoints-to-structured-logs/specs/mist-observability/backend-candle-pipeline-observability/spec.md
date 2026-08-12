## ADDED Requirements

### Requirement: Snapshot ingest log carries native summary fields

The WS client snapshot ingest log (`candle ingest start`) SHALL carry a
bounded native-field summary so that HIL reconciliation of the decode/convert
layer can be performed from backend logs without a datasource evidence
endpoint.

#### Scenario: Ingest log includes native summary

- **WHEN** a snapshot passes client validation and is ingested
- **THEN** the `candle ingest start` log MUST include `nativeKeys`, `asOf`,
  `volume`, `amount` sourced from the decoded native map
- **AND** `nativeKeys` MUST be a sorted, length-capped list
- **AND** the log frequency MUST remain per-snapshot (no additional per-frame
  log is introduced)
