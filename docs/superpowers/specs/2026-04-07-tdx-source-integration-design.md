# TDX Data Source Integration Design

## Summary

Integrate the TDX (通达信) data source from mist-datasource into the mist NestJS project. Provides K-line historical data fetching via REST API and real-time quote streaming via WebSocket with in-memory K-line aggregation.

## Scope

- K-line historical data collection via `TdxSource` (HTTP REST)
- Real-time quote streaming via `TdxWebSocketService` (WebSocket)
- Snapshot aggregation into K-line candles, written to DB on period completion
- Snapshot and completed candle both pushed to frontend clients via NestJS WebSocket Gateway
- Mock support for local development (via mist-datasource mock mode)

Out of scope: financial data, sector data, ETF data, other mist-datasource APIs (can be added incrementally later).

## Interface Layering

```
ISourceFetcher<TRaw = KData>                   (base interface, generic)
  fetchK(params: KFetchParams): Promise<TRaw[]>
  saveK(data: TRaw[], security, period): Promise<void>
  isSupportedPeriod(period): boolean

ITdxSourceFetcher extends ISourceFetcher<TdxResponse>  (TDX extension)
  TDX-specific methods (fetchSnapshot, fetchDividFactors, etc.)

TdxSource implements ITdxSourceFetcher                  (HTTP implementation)
```

- East Money keeps `ISourceFetcher<KData>` (default generic, no behavior change)
- TDX uses `ISourceFetcher<TdxResponse>`, conversion to K entity happens only in `saveK`
- Base utility functions (e.g., `isTradingDay`) are NOT in source interfaces; TDX serves as a fallback implementation for the global utility

### CollectorService Compatibility

```typescript
type SourceData = KData | TdxResponse;  // 新增数据源时在此扩展
```

`CollectorService` stores `Map<DataSource, ISourceFetcher<SourceData>>` and chains `fetchK` → `saveK` without inspecting intermediate data. Since `fetchK` output is passed directly to `saveK` input (both use the same generic `TRaw`), the CollectorService remains type-safe without using `any`.

## Type Definitions

### TdxResponse

Raw response from mist-datasource `/api/tdx/market-data`:

```typescript
interface TdxResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  forwardFactor?: number;
}
```

The HTTP response format `{field: {stockCode: [values]}}` is parsed into `TdxResponse[]` inside `TdxSource.fetchK()`. Each response item maps to one K-line data point with its timestamp, OHLCV, and optional forward factor.

### TdxSnapshot

Real-time snapshot from mist-datasource WebSocket:

```typescript
interface TdxSnapshot {
  stockCode: string;      // e.g., "SH600519"
  now: number;            // current price
  open: number;
  high: number;
  low: number;
  lastClose: number;      // previous close
  volume: number;
  amount: number;
  timestamp: Date;
}
```

The WS message format `{type: "quote", data: {stock_code, snapshot: {...}}}` is parsed into `TdxSnapshot` inside `TdxWebSocketService`.

### TdxExtension

Reuses the existing `TdxExtension` interface from `source-fetcher.interface.ts`:

```typescript
interface TdxExtension {
  fullCode?: string;
  forwardFactor?: number;
  backwardFactor?: number;
  volumeRatio?: number;
  turnoverRate?: number;
  turnoverAmount?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  earningsPerShare?: number;
  priceEarningsRatio?: number;
  priceToBookRatio?: number;
}
```

Note: The DB entity is `KExtensionTdx` (in `@app/shared-data`). `TdxExtension` is the TypeScript interface used in application code; `KExtensionTdx` is the TypeORM entity used for persistence. The mapping happens in `saveK`.

## TdxSource (HTTP REST)

Calls mist-datasource REST API:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `fetchK` | `/api/tdx/market-data` | Historical K-line data |
| `fetchSnapshot` | `/api/tdx/market-snapshot` | Real-time snapshot |
| `fetchDividFactors` | `/api/tdx/divid-factors` | Dividend factors |

### Data Flow

1. `fetchK()` calls `/api/tdx/market-data` with stock codes (using `formatCode`), period, date range
2. HTTP response `{field: {stockCode: [values]}}` is parsed into `TdxResponse[]`
3. `saveK()` converts `TdxResponse[]` to `K` entity + `KExtensionTdx`, writes to DB in transaction

### Stock Code Format

No hardcoded conversion. Stock codes are numeric (e.g., `600519`). Format string read from `SecuritySourceConfig.formatCode` field. Mist-datasource REST API expects `SH600519` format; WebSocket accepts `600519.SH` format. Both are stored in `formatCode` per source.

### Environment Variable

```bash
TDX_BASE_URL=http://192.168.31.182:9001   # local development
TDX_BASE_URL=http://127.0.0.1:9001        # production
```

Added to the app's Joi config schema in `@app/config` (e.g., `mistEnvSchema` and `chanEnvSchema`).

### Mock

No extra mock layer in mist. Development uses mist-datasource's built-in mock mode (`APP_ENV=development`).

## TdxWebSocketService

### Architecture

```
mist-datasource WS (/ws/quote/{client_id})
        |
        v
TdxWebSocketService (implements OnModuleInit, OnModuleDestroy)
  |
  +-- onSnapshot hook --> push snapshot to frontend (NestJS WS Gateway)
  |
  +-- KCandleAggregator (in-memory)
        |
        v
      onCandleComplete hook --> write K + KExtensionTdx to DB
                              --> push completed candle to frontend
```

### Relationship with WebSocketCollectionStrategy

The existing `WebSocketCollectionStrategy` stub is replaced by `TdxWebSocketService`. `TdxWebSocketService` handles the full WebSocket lifecycle (connect, subscribe, aggregate, save). The `WebSocketCollectionStrategy` will be updated to delegate to `TdxWebSocketService` for its `start()`/`stop()` methods, maintaining compatibility with the `CollectionStrategyRegistry`.

### Lifecycle Management

`TdxWebSocketService` implements NestJS `OnModuleInit` and `OnModuleDestroy`:
- `onModuleInit`: Establishes WS connection, starts heartbeat
- `onModuleDestroy`: Gracefully closes WS connection, flushes any incomplete candles
- Connection established on module init (not lazy), since the service needs to be ready for subscriptions

### KCandleAggregator

Pure logic component (no side effects). Maintains in-progress candles per stock+period:

- Each snapshot updates OHLCV: Open (first tick), High (max), Low (min), Close (latest), Volume (cumulative)
- Period boundary detection:
  - 1m: aligned to clock minutes (9:30-9:31, 9:31-9:32, ...)
  - 5m: aligned to :00, :05, :10, ... boundaries (9:30-9:35, 9:35-9:40, ...)
  - 15m: aligned to :00, :15, :30, :45 boundaries
  - 30m: aligned to :00, :30 boundaries
  - 60m: aligned to hourly boundaries
  - A snapshot at exactly the boundary (e.g., 9:35:00) is the first tick of the new candle, not the last of the old one
- Market open: first tick at 9:30 starts the first candle of the day
- Daily candles are NOT produced from snapshots (use REST API for daily data)
- Emits completed candle, starts new period

### Hooks

```typescript
type SnapshotCallback = (snapshot: TdxSnapshot) => void | Promise<void>;
type CandleCompleteCallback = (candle: KData, security: Security, period: Period) => void | Promise<void>;

class TdxWebSocketService {
  onSnapshot(callback: SnapshotCallback): void;
  onCandleComplete(callback: CandleCompleteCallback): void;
}
```

### Connection Management

- Auto-reconnect on disconnect with exponential backoff + re-subscribe to previously subscribed stocks
- Heartbeat via application-level JSON: send `{"type": "ping"}`, expect `{"type": "pong"}` (not WebSocket protocol-level ping)
- Connection status exposed for health check
- Data gap handling: after reconnect, backfill missed candles via REST `fetchK` for the gap period

### Error Handling

- REST failures: throw NestJS `HttpException` with appropriate status code, caller (CollectorService) handles retry
- WS disconnection: auto-reconnect with backoff + backfill via REST
- DB save failure (unique constraint): log warning and skip duplicate (K-line already exists)
- Invalid snapshot data (NaN, zero volume): log warning and skip the snapshot

## Directory Structure

```
apps/mist/src/sources/
  source-fetcher.interface.ts              ISourceFetcher<T> generic, KFetchParams, KData

  east-money/
    east-money-source.service.ts           implements ISourceFetcher<KData>
    east-money-source.service.spec.ts
    types.ts                               EfExtension, EfMinuteResponse, EfDailyResponse

  tdx/
    tdx-source.interface.ts                ITdxSourceFetcher extends ISourceFetcher<TdxResponse>
    tdx-source.service.ts                  implements ITdxSourceFetcher
    tdx-source.service.spec.ts
    tdx-websocket.service.ts               WebSocket connection + aggregation + hooks
    tdx-websocket.service.spec.ts
    kcandle-aggregator.ts                  K-line aggregation engine (pure logic)
    kcandle-aggregator.spec.ts
    types.ts                               TdxExtension, TdxResponse, TdxSnapshot

  mqmt/                                    future expansion
```

### Naming Convention

`{Source}{Purpose}` — prefix by data source (`Ef`/`Tdx`/`Mqmt`), suffix by usage:

| Suffix | Meaning | Example |
|--------|---------|---------|
| `Extension` | Application-level type (maps to DB entity `KExtensionXxx`) | `TdxExtension`, `EfExtension` |
| `Response` | HTTP API response type | `TdxResponse`, `EfMinuteResponse` |
| `Snapshot` | WebSocket real-time data | `TdxSnapshot` |

### Module Registration

`CollectorService` directly injects source classes by name (same as existing pattern with `EastMoneySource`):

```typescript
// collector.module.ts — add TdxSource to providers
providers: [CollectorService, EastMoneySource, TdxSource]

// collector.service.ts — direct class injection
constructor(
  private readonly eastMoneySource: EastMoneySource,
  private readonly tdxSource: TdxSource,
)
```

`CollectorModule` adds `KExtensionTdx` to its `TypeOrmModule.forFeature()` array alongside existing entities:

```typescript
TypeOrmModule.forFeature([K, KExtensionEf, KExtensionTdx, Security, SecuritySourceConfig])
```

This is needed because `TdxSource.saveK()` writes to `KExtensionTdx` entity and requires the TypeORM repository to be available.

## Migration Plan

Directory restructuring is done in a single PR with these steps:

1. Move `east-money.source.ts` → `east-money/east-money-source.service.ts` (rename file)
2. Move `tdx.source.ts` (stub) → `tdx/tdx-source.service.ts` (rewrite)
3. Update all imports in `collector.module.ts`, `collector.service.ts`, and any other consumers
4. Add `types.ts` for each source, move extension types from `source-fetcher.interface.ts`
5. Keep `source-fetcher.interface.ts` re-exporting types for backward compatibility during transition

## Testing Strategy

- **KCandleAggregator**: Pure logic unit tests — verify period boundary detection, OHLCV accumulation, multi-minute period alignment, edge cases (boundary tick, first tick of day)
- **TdxSource**: Unit tests with mocked HTTP responses — verify response parsing, `TdxResponse` → K entity conversion, stock code format handling
- **TdxWebSocketService**: Unit tests with mocked WebSocket — verify reconnection, subscription management, snapshot → aggregator → candle flow, hook invocation
- **Integration tests**: Against mist-datasource mock adapter (`APP_ENV=development`) — verify end-to-end fetch → save → read flow

## Key Decisions

1. **Generic interface**: `ISourceFetcher<TRaw>` allows each source to use its own intermediate data type. East Money keeps `KData`, TDX uses `TdxResponse`. Conversion happens only at `saveK` time. `CollectorService` uses union type `SourceData = KData | TdxResponse` in its map, type-safe without `any`.

2. **WebSocketCollectionStrategy delegation**: `TdxWebSocketService` replaces the stub `WebSocketCollectionStrategy`. The strategy delegates `start()`/`stop()` to `TdxWebSocketService`, maintaining `CollectionStrategyRegistry` compatibility.

3. **Dual push**: Both raw snapshots and completed K-line candles are pushed to frontend via NestJS WebSocket Gateway.

4. **Stock code format from DB**: No hardcoded code format conversion. Read `formatCode` from `SecuritySourceConfig` table. Different formats for REST (`SH600519`) and WS (`600519.SH`) are stored separately.

5. **Environment-based URL**: Single `TDX_BASE_URL` env var handles local vs production address difference. Validated via Joi schema in `@app/config`.

6. **No separate mock**: mist-datasource mock mode (`APP_ENV=development`) provides test data. mist project does not add its own mock layer.

7. **Application-level heartbeat**: Use JSON `{"type": "ping"}`/`{"type": "pong"}` messages, not WebSocket protocol-level ping frames.
