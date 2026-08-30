# web-visualization Specification

## Purpose
TBD - created by archiving change integrate-lightweight-charts-web-visualization. Update Purpose after archive.
## Requirements
### Requirement: Web Visualization SHALL Render Chan Layers Via Dual-Request Same-Source Pipeline

The web frontend SHALL fetch chart data via dual-request same-source: `fetchK` (`POST /v1/indicators/k`) for the main candlestick series and `fetchVisualCommands` (`GET /v1/visual/commands?code=...&period=...&source=...&layers=chan`) for Chan geometry, both driven by the same query `{code, period, source, startDate, endDate}`. Both controllers SHALL share the same query source `IndicatorService.findKData` with identical `WHERE`/`ORDER BY` semantics and co-consume the unified `MarketDataPipeline` (先精度 `KPriceProjector: 多零归一 1.200→1.20 / clamp / 0可锚` → 后补齐 `Imputer: 0=observed, null/NaN→补全` → `effective`) to render all Chan layers (Bi, Duan, Bi-channel, Duan-channel, buy/sell points) on the TradingView Lightweight Charts canvas at 60 FPS without coordinate offset. Single-request mode SHALL be considered deprecated.

#### Scenario: Single request renders the full Chan layer set
- **WHEN** the frontend loads a security/period K-line analysis page (e.g. code `000001`, period `5m`)
- **THEN** it MUST issue dual requests (`POST /v1/indicators/k` for candlesticks and `GET /v1/visual/commands` for Chan geometry, same query) with unified envelope and `VisualCommandPayload` response within 50 ms
- **AND** the Lightweight Charts canvas MUST initialize the main Candlestick series and draw all layers on the same canvas:

| 图层名称 | 指令类型 | 几何表现 |
|----------|---------|---------|
| chan_bi | line | 黄色笔连接各分型极值点 |
| chan_duan | line | 洋红色加粗线段连接特征序列极值点 |
| chan_zs_bi | band | 天蓝色半透明笔中枢矩形方框 |
| chan_zs_duan | band | 靛蓝色半透明段中枢矩形方框 |
| chan_bsp | text | 1买/2买/3买 (红色底标) 与 1卖/2卖/3卖 (绿色顶标) |

#### Scenario: Instrument or period switch keeps zero coordinate misalignment
- **WHEN** the user switches from one code/period to another (e.g. `000001` to `600519`, or `5m` to `1d`)
- **THEN** the frontend MUST re-request the corresponding visual commands, clear the historical series and load the new data within 100 ms
- **AND** all Bi/Duan/central start and end timestamps MUST align strictly with the underlying K-line bars
- **AND** there MUST be no console errors, no missing timestamps and no fabricated zero values

#### Scenario: Backtest replay and Chan snapshot pages reuse the same consumer
- **WHEN** the backtest workspace (`/backtests`) or the snapshot test page (`/chan-tests`) passes in execution-generated buy/sell signals or regression snapshot data
- **THEN** the Lightweight Charts consumer MUST be the same `VisualCommand` component as the live page
- **AND** buy/sell bubbles and central evolution MUST be marked accurately above or below the corresponding K-line bars

