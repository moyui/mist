## ADDED Requirements

### Requirement: Index Multi-Period Multi-Structure Realtime Evaluation

The engine SHALL support evaluating multiple concurrent `chan_bsp` strategy instances on the same INDEX security, spanning distinct evaluation levels (5m and 30m) and structural unit levels (`bi` and `duan`). Each evaluation pipeline MUST independently manage its own monotonic `ChanBspEpisodeCursor` identified by `{ definitionId, securityId, source, level, units }`.

#### Scenario: 5m and 30m bi and duan strategies evaluate on the same index

- **WHEN** an INDEX security is bound to 4 active `chan_bsp` strategy definitions (5m bi, 5m duan, 30m bi, 30m duan)
- **THEN** a sealed candle trigger MUST evaluate all 4 definitions independently
- **AND** a confirmed BSP event on the 5m bi structure MUST NOT suppress or interfere with a 30m duan confirmation
- **AND** each candidate emitted MUST carry the exact structural unit (`bi` vs `duan`) in its context snapshot

### Requirement: Historical K-Line Window Pre-Warming

Before realtime evaluation begins, the database SHALL be pre-populated with sufficient historical K-lines to satisfy `CHAN_BSP_WINDOW_BUDGET` (500 bars for 5m, 200 bars for 30m).

#### Scenario: Window length satisfies budget

- **WHEN** MySQL contains >= 500 historical 5m bars and >= 200 historical 30m bars for an index
- **THEN** `loadRealtimeWindow` MUST supply a full window to `ChanBspDetector` on the very first evaluation trigger of the trading day
- **AND** `ChanBspDetector.evaluate` MUST NOT short-circuit to `[]` due to bar shortage
