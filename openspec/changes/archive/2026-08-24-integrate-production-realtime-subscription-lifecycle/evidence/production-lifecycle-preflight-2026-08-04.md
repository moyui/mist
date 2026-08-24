# Production realtime subscription lifecycle preflight — 2026-08-04

## Scope and provenance

- Read-only production workflow: `mist-deploy` run `30920077138`, commit
  `e0de8e39043fa14ee5571b5f2d1efe9ec4b3967b`, completed successfully.
- Capture instant: `2026-08-04T14:40:10.5585682Z`.
- The audit queried metadata and aggregate counts only. It did not execute DDL/DML and did not
  disclose raw allowlist symbols, QMT IDs, journal contents or credentials.
- Terminal artifact inspection: `mist-deploy` run `30870745531`, inspected
  `2026-08-04T10:06:24.9031197+08:00`.
- Runtime identity cross-check: candle HIL runs `30872226421` and `30872332428`, as recorded in
  `complete-current-day-realtime-candles/evidence/2026-08-04-trading-session-hil.md`.

## Migration ledger and reserved number

- Production `schema_migrations` contains exactly 14 rows, consecutively `001` through `014`.
- Latest applied migration is `014_evolve_strategy_evaluation_contract.sql`, applied at
  `2026-08-04 09:21:21.421800`.
- Repository migration inventory also ends at `014`.
- Therefore the first unused migration number for this change is **`015`**. Existing migration
  `014` and all earlier applied files remain immutable.

## Existing schema and rows

`securities` exists with `id`, `code`, `name`, `type`, `status`, `created_at`, `updated_at`, primary
key `id`, and unique `uq_securities_code(code)`. It contains 9 rows: 5 ACTIVE and 4 non-ACTIVE,
split as 5 STOCK and 4 INDEX.

`security_source_configs` exists with `id`, `security_id`, `source`, `format_code`, `priority`,
`enabled`, `created_at`, `updated_at`; it has primary key `id`, unique
`uq_security_source_configs_security_source(security_id, source)`, index on `security_id`, and FK
to `securities(id)`. It contains 13 enabled rows: 2 `ef`, 9 `tdx`, and 2 `qmt`.

Aggregate integrity checks returned:

- securities: 9;
- source configs: 13;
- orphan source configs: 0;
- duplicate `(security_id, source)` groups: 0;
- enabled TDX/QMT configs with invalid provider symbol format: 0.

`realtime_subscription_assignments` does not yet exist. Migration `015` must create it and add the
named `(id, security_id)` source-config uniqueness required by the composite assignment FK.

## Current desired authorities and QMT durable state

- `TDX_REALTIME_ALLOWLIST` is configured with 2 normalized symbols; sanitized digest
  `a5f4c438f97eaf390a97840add0b4d417408e0aced6b1f86335ade81ce655c1b`.
- `QMT_REALTIME_ALLOWLIST` is configured with 2 normalized symbols; sanitized digest
  `4bd631b60242e64a213aecf68e7e1b5706dea080b16c29a6d458f9bb0b638b65`.
- These non-empty legacy authorities require lifecycle mode to remain `off`; promotion to `on`
  must fail closed until operators explicitly clear both values after assignments are initialized.
- QMT durable journal exists at the configured state location, length 64,620 bytes, SHA-256
  `2c1010ed3b88571b0936c2d70b7f16a16caf88a95f386618b3ce849d02d9cc6e`, last written
  `2026-08-04T05:55:02.6196123Z`.
- No manifest/checkpoint file was present in the bounded state inventory.
- The current datasource health contract returned no aggregate `qmtSubscriptionHealth`; this is
  recorded as **unknown**, not healthy and not zero. Startup replay/reconciliation remains an
  implementation and production-HIL gate.

## Installed terminal artifact identities

- TDX installed path: `F:\quant\tdx\PYPlugins\user\mist_tdx_realtime_bridge.py`.
  Installed and canonical SHA-256 both equal
  `750cabf97c5812423987cab70c25d385976b6edf1bad6419cf30a1bb1ddfce51`; build
  `mist-tdx-realtime-bridge-v2.1`.
- QMT imported project artifact: `F:\quant\qmt\python\正式采集.py`, SHA-256
  `851e943d9579f1e1a8d08b5764cb53f1f05fb12c0bb496d020e010c05b72da52`.
  The platform did not expose a file-backed loaded implementation, so disposition is
  `platform_unavailable`, not an installed-file match. Production runtime evidence instead pins
  build `mist-qmt-realtime-bridge-v2.0` and runtime fingerprint
  `55d14d2377c2d8701cbf95a212b9d6f2e198c5a7dc3b1fbf5433d156ce7da652`.

## Gate result

Task 1.2 passes as a read-only baseline. It authorizes forward-only migration `015` and contract
implementation with lifecycle mode defaulted `off`. It does **not** authorize lifecycle promotion,
claim QMT reconciliation healthy, or treat legacy allowlists as assignment input.
