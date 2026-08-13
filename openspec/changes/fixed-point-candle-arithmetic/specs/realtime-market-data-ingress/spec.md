# realtime-market-data-ingress Specification Delta

> Delta from change `fixed-point-candle-arithmetic`.

## MODIFIED Requirements

### Requirement: Sealed candle numeric fields SHALL be fixed-point (2-decimal cents semantics)

（**待 D1-D5 确认后定稿**——当前为草案）

The sealed 1-minute candle numeric fields (`o/h/l/c`) and the VWAP
calculation SHALL NOT introduce binary floating-point intermediate values
beyond a single explicit rounding to 2 decimal places:

- `cumulativeVolume` / `cumulativeAmount` (string source values) SHALL be
  converted to integer cents once (`round(amount * 100)`), then all VWAP
  arithmetic SHALL be integer division with explicit rounding:
  `vwap_cents = round(amount_cents / volume)`.
- The VWAP band expansion (`high = max(high, vwap)`, `low = min(low, vwap)`)
  SHALL operate on 2-decimal values only.
- Every sealed numeric field SHALL satisfy the fixed-point invariant
  `abs(v * 100 - round(v * 100)) < 1e-9` (enforced by unit test gate).

Rationale: binary float division `amount / volume` can produce sub-cent
values (e.g. 1349.4286) inconsistent with MySQL `DECIMAL(20,2)` and with
the historical (provider-original) candle series. Fixed-point arithmetic
makes realtime sealed values and MySQL-backed history agree at cent
precision (F1-q).

#### Scenario: VWAP falls outside the sampled band

Given a bucket with `cumulativeVolume = "12126800"` (string) and
`cumulativeAmount = "5371394900"` (string), and observed last-price
sampled `[low, high]` that does not contain `amount / volume`:

- the VWAP SHALL be computed via fixed-point arithmetic
  (`amount_cents = round(5371394900 * 100)`, `vwap_cents = round(amount_cents / 12126800)`)
- the sealed `high` SHALL be `max(high, vwap_cents / 100)` where `vwap_cents / 100`
  is the 2-decimal value
- every sealed numeric field SHALL satisfy
  `abs(v * 100 - round(v * 100)) < 1e-9`

#### Scenario: Sealed output regression gate

Given any sealed 1-minute candle produced by the aggregator:

- each numeric field `o/h/l/c` SHALL satisfy the fixed-point invariant
  `abs(v * 100 - round(v * 100)) < 1e-9`
- the unit test suite SHALL include at least one case asserting this
  invariant across a full aggregator run (gate, not advisory)
