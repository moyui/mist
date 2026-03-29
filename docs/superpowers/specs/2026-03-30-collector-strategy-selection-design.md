# Design: Collector Runtime Strategy Selection

**Date**: 2026-03-30
**Status**: Draft

## Problem

`CollectorController` directly injects `EastMoneyCollectionStrategy`, making it impossible to collect data from other sources (TDX, miniQMT) via the API. The controller ignores the `source` field in `CollectDto` when selecting a strategy.

Meanwhile, the schedule app should continue using fixed `EastMoneyCollectionStrategy` for its cron jobs.

## Current Architecture

```
CollectorController ──hardcoded──→ EastMoneyCollectionStrategy
                                       ↓
                                 CollectorService.collectKLineForSource()
                                       ↓
                                 Source fetchers (EastMoney/TDX)
```

## Proposed Architecture

```
CollectDto.source?
      ↓
CollectorController
      ↓ resolve(source?)
CollectionStrategyRegistry
      ↓ DataSourceService.select(source) → final DataSource
      ↓ registry.get(dataSource) → IDataCollectionStrategy
      ↓
EastMoneyCollectionStrategy | (future: TDX, miniQMT...)
      ↓
CollectorService.collectKLineForSource()
```

## Changes

### 1. New `CollectionStrategyRegistry`

Location: `apps/mist/src/collector/strategies/collection-strategy.registry.ts`

```typescript
@Injectable()
export class CollectionStrategyRegistry {
  private readonly strategies = new Map<DataSource, IDataCollectionStrategy>();

  constructor(
    private readonly dataSourceService: DataSourceService,
    @Inject(COLLECTION_STRATEGIES)
    private readonly strategyList: IDataCollectionStrategy[],
  ) {
    for (const strategy of strategyList) {
      this.strategies.set(strategy.source, strategy);
    }
  }

  resolve(source?: DataSource): IDataCollectionStrategy {
    // Use provided source, or fall back to env default
    const resolved = source ?? this.dataSourceService.getDefault();
    const strategy = this.strategies.get(resolved);
    if (!strategy) {
      throw new BadRequestException(
        `No collection strategy found for data source: ${resolved}`,
      );
    }
    return strategy;
  }
}
```

### 2. Provider Token `COLLECTION_STRATEGIES`

Location: `apps/mist/src/collector/strategies/collection-strategy.registry.ts`

```typescript
export const COLLECTION_STRATEGIES = Symbol('COLLECTION_STRATEGIES');
```

All strategies implementing `IDataCollectionStrategy` are registered under this token.

### 3. `CollectorModule` Registration

```typescript
providers: [
  // ... existing providers
  {
    provide: COLLECTION_STRATEGIES,
    useFactory: (...strategies: IDataCollectionStrategy[]) => strategies,
    inject: [EastMoneyCollectionStrategy], // add more strategies here later
  },
  CollectionStrategyRegistry,
],
```

### 4. `CollectorController` Update

Replace direct `EastMoneyCollectionStrategy` injection with `CollectionStrategyRegistry`:

```typescript
constructor(
  private readonly securityService: SecurityService,
  private readonly registry: CollectionStrategyRegistry,
) {}

// In collect():
const strategy = this.registry.resolve(dto.source);
await strategy.collectForSecurity(security, dto.period);
```

### 5. Schedule App — No Change

`DataCollectionScheduleController` continues to directly inject and use `EastMoneyCollectionStrategy`. This is correct because:
- Scheduled collection should use a fixed, predictable strategy
- The schedule app does not need runtime source selection

## Files Changed

| File | Action |
|------|--------|
| `apps/mist/src/collector/strategies/collection-strategy.registry.ts` | **New** — Registry + provider token |
| `apps/mist/src/collector/collector.controller.ts` | **Edit** — Replace `EastMoneyCollectionStrategy` with `CollectionStrategyRegistry` |
| `apps/mist/src/collector/collector.module.ts` | **Edit** — Register `COLLECTION_STRATEGIES` provider and `CollectionStrategyRegistry` |

## Extensibility

Adding a new strategy (e.g., TDX) requires:

1. Create `TdxCollectionStrategy implements IDataCollectionStrategy`
2. Add it to `COLLECTION_STRATEGIES` factory inject array in `CollectorModule`

No changes needed in `CollectorController` or `CollectionStrategyRegistry`.
