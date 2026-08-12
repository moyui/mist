# realtime-market-data-ingress Specification Delta

> Delta from change `decouple-bridge-callback-and-correct-vwap-bounds`.

## ADDED Requirements

### Requirement: Sealed candle high/low SHALL include the authoritative VWAP

The sealed 1-minute candle `high` and `low` fields are sampled-band extrema
(computed as the min/max of the `last-price` values observed across snapshots
within the bucket). Because the provider callback delivers only a change signal
(not the price itself) and the fetch captures the "processing-time" snapshot,
intrabucket price spikes can land between samples. The authoritative VWAP
(`amount / volume`, sourced from real exchange trade totals) is more reliable
than the sampled band.

The backend SHALL, at seal time, expand `[low, high]` to include the VWAP when
both cumulative volume and amount are positive:

```
if (volume > 0 && amount > 0):
    vwap = amount / volume
    high = max(high, vwap)
    low  = min(low, vwap)
```

This guarantees the sealed candle is self-consistent: VWAP always lies within
`[low, high]`. The semantic of `high`/`low` changes from "sampled-band extrema"
to "sampled-band extrema union {vwap}" — downstream strategy admission gates
that reject candles where `vwap ∉ [low, high]` will no longer be blocked by
sampling artifacts.

#### Scenario: VWAP exceeds sampled high

- **WHEN** a sealed candle has `high=1355`, `low=1350`, `volume=10000`, `amount=13560000`
- **THEN** the VWAP is `1356`
- **AND** the sealed `high` SHALL be corrected to `1356` (max of 1355 and 1356)
- **AND** the sealed `low` SHALL remain `1350`

#### Scenario: VWAP below sampled low

- **WHEN** a sealed candle has `high=1355`, `low=1350`, `volume=10000`, `amount=13494000`
- **THEN** the VWAP is `1349.4`
- **AND** the sealed `low` SHALL be corrected to `1349.4` (min of 1350 and 1349.4)
- **AND** the sealed `high` SHALL remain `1355`

#### Scenario: VWAP within band (no correction)

- **WHEN** a sealed candle has `high=1355`, `low=1350`, `volume=10000`, `amount=13525000`
- **THEN** the VWAP is `1352.5` (already within `[1350, 1355]`)
- **AND** the sealed `high` and `low` SHALL remain unchanged

#### Scenario: Missing or zero quantity (no correction)

- **WHEN** a sealed candle has `volume=0` or `amount=0` or either is null
- **THEN** the VWAP bound correction SHALL NOT apply
- **AND** the sealed `high` and `low` SHALL remain the sampled-band extrema
- **AND** the candle SHALL be classified as `missing_quantity_with_prices` by the
  downstream vwap check (per fix-tdx-vwap A3)

### Requirement: Bridge subscribe callback SHALL be thin (no SDK calls)

The TDX `subscribe_hq` callback and the QMT `subscribe_quote` callback SHALL NOT
invoke any SDK method (`get_market_snapshot`, `get_full_tick`, etc.) or perform
socket/network send inside the callback body. The callback SHALL only append a
minimal signal (TDX: the changed symbol code; QMT: the bounded-copy payload) to
a process-local queue. The main thread SHALL own all SDK calls and transport
send operations by draining the queue.

This invariant is frozen as C0.1 in the bridge source header and backed by the
official TDX design rule ("keep the callback thin").

#### Scenario: TDX callback appends code only

- **WHEN** the TDX SDK invokes the subscribe_hq callback with `{"Code": "600519.SH"}`
- **THEN** the callback SHALL append `"600519.SH"` to the dirty queue
- **AND** the callback SHALL NOT call `get_market_snapshot`, `get_quote`, or any transport send
- **AND** the callback SHALL return immediately

#### Scenario: QMT callback appends payload only

- **WHEN** the QMT SDK invokes the subscribe_quote callback with a native tick dict
- **THEN** the callback SHALL bounded-copy the payload and append it to the snapshot queue
- **AND** the callback SHALL NOT call `_push_snapshot`, `sender.send`, or any transport send
- **AND** the callback SHALL return immediately

#### Scenario: Main thread drains queue and owns SDK calls

- **WHEN** the main loop detects a non-empty queue
- **THEN** the main thread SHALL popleft entries and perform the SDK fetch (TDX) or
  transport send (QMT) sequentially
- **AND** all `get_market_snapshot` calls and `sender.send` calls SHALL execute on the main thread
