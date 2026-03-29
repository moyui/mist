# Collector Runtime Strategy Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `EastMoneyCollectionStrategy` in `CollectorController` with a runtime registry that selects strategies based on the request's `source` field or the env default.

**Architecture:** A new `CollectionStrategyRegistry` holds a `Map<DataSource, IDataCollectionStrategy>`. The controller calls `registry.resolve(dto.source)` to get the correct strategy. NestJS DI injects all strategy implementations via a `COLLECTION_STRATEGIES` provider token. The schedule app is unchanged.

**Tech Stack:** NestJS DI (provider tokens, factory providers), TypeORM, Jest

**Spec:** `docs/superpowers/specs/2026-03-30-collector-strategy-selection-design.md`

---

### Task 1: Create CollectionStrategyRegistry with tests

**Files:**
- Create: `apps/mist/src/collector/strategies/collection-strategy.registry.ts`
- Create: `apps/mist/src/collector/strategies/collection-strategy.registry.spec.ts`

- [ ] **Step 1: Write failing tests for CollectionStrategyRegistry**

```typescript
// apps/mist/src/collector/strategies/collection-strategy.registry.spec.ts
import { DataSource } from '@app/shared-data';
import { BadRequestException } from '@nestjs/common';
import {
  CollectionStrategyRegistry,
  COLLECTION_STRATEGIES,
} from './collection-strategy.registry';
import { IDataCollectionStrategy } from './data-collection.strategy.interface';

describe('CollectionStrategyRegistry', () => {
  let registry: CollectionStrategyRegistry;
  let mockDataSourceService: { getDefault: jest.Mock };
  let mockEastMoneyStrategy: IDataCollectionStrategy;

  beforeEach(() => {
    mockDataSourceService = {
      getDefault: jest.fn().mockReturnValue(DataSource.EAST_MONEY),
    };

    mockEastMoneyStrategy = {
      source: DataSource.EAST_MONEY,
      mode: 'polling' as const,
      collectForSecurity: jest.fn(),
    };

    registry = new CollectionStrategyRegistry(
      mockDataSourceService as any,
      [mockEastMoneyStrategy],
    );
  });

  describe('resolve', () => {
    it('should return strategy matching the provided source', () => {
      const result = registry.resolve(DataSource.EAST_MONEY);
      expect(result).toBe(mockEastMoneyStrategy);
    });

    it('should fall back to env default when no source provided', () => {
      const result = registry.resolve(undefined);
      expect(mockDataSourceService.getDefault).toHaveBeenCalled();
      expect(result).toBe(mockEastMoneyStrategy);
    });

    it('should throw BadRequestException for unregistered source', () => {
      expect(() => registry.resolve(DataSource.TDX)).toThrow(
        BadRequestException,
      );
      expect(() => registry.resolve(DataSource.TDX)).toThrow(
        'No collection strategy found for data source: tdx',
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest apps/mist/src/collector/strategies/collection-strategy.registry.spec.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/mist/src/collector/strategies/collection-strategy.registry.ts
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';
import { IDataCollectionStrategy } from './data-collection.strategy.interface';

export const COLLECTION_STRATEGIES = Symbol('COLLECTION_STRATEGIES');

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest apps/mist/src/collector/strategies/collection-strategy.registry.spec.ts --no-cache`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/strategies/collection-strategy.registry.ts apps/mist/src/collector/strategies/collection-strategy.registry.spec.ts
git commit -m "feat: add CollectionStrategyRegistry with provider token"
```

---

### Task 2: Register COLLECTION_STRATEGIES provider in CollectorModule

**Files:**
- Modify: `apps/mist/src/collector/collector.module.ts`

- [ ] **Step 1: Update CollectorModule providers and exports**

Current `collector.module.ts` (lines 19-27):
```typescript
  providers: [
    CollectorService,
    EastMoneyCollectionStrategy,
    EastMoneyTimeWindowStrategy,
    EastMoneySource,
    TdxSource,
  ],
  controllers: [CollectorController],
  exports: [CollectorService, EastMoneyCollectionStrategy],
```

Change to:
```typescript
  providers: [
    CollectorService,
    EastMoneyCollectionStrategy,
    EastMoneyTimeWindowStrategy,
    EastMoneySource,
    TdxSource,
    {
      provide: COLLECTION_STRATEGIES,
      useFactory: (eastMoney: EastMoneyCollectionStrategy) => [eastMoney],
      inject: [EastMoneyCollectionStrategy],
    },
    CollectionStrategyRegistry,
  ],
  controllers: [CollectorController],
  exports: [CollectorService, EastMoneyCollectionStrategy],
```

Add imports at top of file:
```typescript
import { COLLECTION_STRATEGIES, CollectionStrategyRegistry } from './strategies/collection-strategy.registry';
```

- [ ] **Step 2: Verify module compiles**

Run: `npx tsc --noEmit --project apps/mist/tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/collector/collector.module.ts
git commit -m "feat: register CollectionStrategyRegistry in CollectorModule"
```

---

### Task 3: Update CollectorController to use registry

**Files:**
- Modify: `apps/mist/src/collector/collector.controller.ts`

- [ ] **Step 1: Replace EastMoneyCollectionStrategy with CollectionStrategyRegistry**

Current constructor (line 20-23):
```typescript
  constructor(
    private readonly securityService: SecurityService,
    private readonly strategy: EastMoneyCollectionStrategy,
  ) {}
```

Change to:
```typescript
  constructor(
    private readonly securityService: SecurityService,
    private readonly registry: CollectionStrategyRegistry,
  ) {}
```

Current line 59:
```typescript
    await this.strategy.collectForSecurity(security, dto.period);
```

Change to:
```typescript
    const strategy = this.registry.resolve(dto.source);
    await strategy.collectForSecurity(security, dto.period);
```

Update imports — remove `EastMoneyCollectionStrategy`, add `CollectionStrategyRegistry`:
```typescript
import { CollectionStrategyRegistry } from './strategies/collection-strategy.registry';
```

- [ ] **Step 2: Verify controller compiles**

Run: `npx tsc --noEmit --project apps/mist/tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Run existing tests to verify nothing is broken**

Run: `npx jest apps/mist/src/collector/ --no-cache`
Expected: All existing tests pass (collector.service.spec.ts, east-money-collection.strategy.spec.ts)

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/collector/collector.controller.ts
git commit -m "refactor: use CollectionStrategyRegistry in CollectorController"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run all collector tests**

Run: `npx jest apps/mist/src/collector/ --no-cache`
Expected: All tests pass (including new registry tests)

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit --project apps/mist/tsconfig.app.json`
Expected: No errors

- [ ] **Step 3: Verify schedule app is unaffected**

Run: `npx tsc --noEmit --project apps/schedule/tsconfig.app.json`
Expected: No errors (schedule still directly injects `EastMoneyCollectionStrategy`)
