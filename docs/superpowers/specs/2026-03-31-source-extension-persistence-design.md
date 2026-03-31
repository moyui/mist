# Source Extension Persistence Design

**Date**: 2026-03-31
**Status**: Approved

## Problem

K-line data flows through three layers: Source fetch → Collector orchestration → DB persistence. Two issues:

1. **Data loss**: Source implementations convert platform-specific API responses to a narrow `KData` interface (only OHLCV + amount), discarding valuable fields like amplitude, change percentage, turnover rate.
2. **Missing persistence**: Extension entities (`KExtensionEf`, `KExtensionTdx`, `KExtensionMqmt`) exist in the DB schema but are never populated.

## Design Decision

**Source layer becomes fully autonomous**: each Source handles both fetching AND saving (including platform-specific extension tables). The Collector delegates to Source instead of managing persistence itself.

```
CollectorService                    ISourceFetcher
┌──────────────┐         ┌─────────────────────────┐
│ collectK()   │────────▶│ fetchK()  → fetch KData  │
│              │         │ saveK()   → save K + ext  │
│ orchestrate  │         │ isSupportedPeriod()      │
│ only         │         └─────────────────────────┘
└──────────────┘                    │
                          ┌────────┼────────┐
                    EastMoney    TDX      MQMT
                    (K + Ef)   (K + Tdx)  (K + Mqmt)
```

## Changes

### 1. Interface Layer — `source-fetcher.interface.ts`

Add extension type definitions and `saveK()` to the interface:

```ts
// Platform-specific extension types
export interface EfExtension {
  fullCode?: string;
  amplitude?: number;
  changePct?: number;
  changeAmt?: number;
  turnoverRate?: number;
  volumeCount?: number;
  innerVolume?: number;
  outerVolume?: number;
  prevClose?: number;
  prevOpen?: number;
}

export interface TdxExtension {
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

export interface MqmtExtension {
  fullCode?: string;
}

// KData gains optional extensions field
export interface KData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  period: number;
  extensions?: EfExtension | TdxExtension | MqmtExtension;
}

// ISourceFetcher gains saveK()
export interface ISourceFetcher {
  fetchK(params: KFetchParams): Promise<KData[]>;
  saveK(data: KData[], security: Security, period: Period): Promise<void>;
  isSupportedPeriod(period: Period): boolean;
}
```

### 2. East Money Source — `east-money.source.ts`

**fetchK()**: Fill `extensions` field from API response data:
- `fetchPeriod()`: Extract amplitude (振幅), changePct (涨跌幅), changeAmt (涨跌额), turnoverRate (换手率) from `SecurityPeriodVo` fields
- `fetchDaily()`: No extension data available from daily API, leave extensions undefined

**saveK()**: Transaction-based two-step save:
1. Save base K entities via `manager.save(K, kEntities)`
2. Save `KExtensionEf` entities linked to the saved K records via `manager.save(KExtensionEf, extensions)`

Inject `DataSource` (TypeORM) and `Repository<KExtensionEf>` via constructor.

### 3. TDX Source — `tdx.source.ts`

- `fetchK()`: Returns empty array (unchanged)
- `saveK()`: No-op (empty array = nothing to save)
- Skeleton ready for future implementation

### 4. MQMT Source

Same pattern as TDX — skeleton with no-op `saveK()`.

### 5. Collector Service — `collector.service.ts`

- Remove `saveKData()` private method
- Replace with `source.saveK(kData, security, period)` call
- Collector becomes pure orchestration: fetch → save, with no knowledge of platform-specific fields

## Transaction Strategy

Each Source's `saveK()` uses `DataSource.transaction()` to wrap:
1. Base K entity save (returns entities with generated IDs)
2. Extension entity save (references the saved K entities)

No modifications to the K entity itself (no cascade relations added).

## Files Changed

| File | Change |
|------|--------|
| `apps/mist/src/sources/source-fetcher.interface.ts` | Add extension types, extensions to KData, saveK to ISourceFetcher |
| `apps/mist/src/sources/east-money.source.ts` | Fill extensions in fetchK, implement saveK with transaction |
| `apps/mist/src/sources/tdx.source.ts` | Add saveK no-op |
| `apps/mist/src/collector/collector.service.ts` | Remove saveKData, delegate to source.saveK |

## Out of Scope

- K entity schema changes
- TDX/MQMT actual data fetching (still unimplemented)
- Read/query endpoints for extension data
- Extension data in API responses
