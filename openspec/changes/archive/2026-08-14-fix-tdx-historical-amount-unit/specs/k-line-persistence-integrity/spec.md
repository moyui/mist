# k-line-persistence-integrity Specification Delta

> Delta from change `fix-tdx-historical-amount-unit`.

## MODIFIED Requirements

### Requirement: TDX historical amount SHALL be persisted in yuan (canonical)

（**待 D1-D4 确认后定稿**——当前为草案）

The backend K-line persistence boundary SHALL persist TDX-sourced `amount`
in canonical **yuan**, never in the provider-native 10-thousand-yuan
(万元) unit.

- The TDX historical write path (`normalizeTdxBarQuantity` on `Amount`)
  SHALL convert 万元 → 元 by exact fixed-point multiplication (`×10000`,
  Decimal8 `scaleByUnit(10000)` semantics, no binary-float arithmetic).
- `volume` SHALL remain the provider-native integral share value (no unit
  conversion).
- Existing `k` rows with `source='tdx'` SHALL be repaired once (forward-only
  data migration) so historical and realtime TDX amounts agree at yuan
  precision.
- Future historical-sync write paths (e.g. post-close sync) SHALL reuse the
  same conversion contract.

Rationale: realtime TDX snapshots already convert 万元 → 元 in the converter;
the historical path stored the raw 万元 value, making the same bar disagree
by a factor of 10000 between realtime (yuan) and historical (10k-yuan)
consumers (2026-08-13 backtest quantity HIL finding, 600519 737346.25 万元 =
7,373,462,500 元).

#### Scenario: TDX historical bar with provider-native 万元 amount

Given a TDX historical bar with `amount = "737346.25"` (万元, 600519 日线):

- the persisted `k.amount` SHALL be `7373462500` (元)
- `k.volume` SHALL be unchanged (e.g. `5512752` shares)

#### Scenario: Existing tdx k rows after the data repair

Given the forward-only data migration has run:

- every `k` row with `source='tdx'` and non-null `amount` SHALL satisfy
  `amount = 10000 × (pre-repair amount)`
- spot-check values SHALL match the real market totals (e.g. 600519
  ≈ 7,373,462,500 元)

#### Scenario: Volume is never unit-converted

Given a TDX historical bar with `volume = "5512752"`:

- the persisted `k.volume` SHALL remain `5512752` (shares)
