# Source Extension Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Source autonomous — fetch platform-specific extension data and persist both base K + extension entities via a `saveK()` method.

**Architecture:** Add extension types and `saveK()` to `ISourceFetcher` interface. Each Source implementation fills `KData.extensions` during fetch and uses a TypeORM transaction in `saveK()` to atomically save base K + platform extension. CollectorService delegates all persistence to the Source.

**Tech Stack:** NestJS, TypeORM (transactions, repositories), Jest

**Spec:** `docs/superpowers/specs/2026-03-31-source-extension-persistence-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/mist/src/sources/source-fetcher.interface.ts` | Modify | Add extension types, `extensions` to KData, `saveK` to ISourceFetcher |
| `apps/mist/src/sources/east-money.source.ts` | Modify | Fill extensions in fetchK, implement saveK with transaction |
| `apps/mist/src/sources/east-money.source.spec.ts` | Modify | Update existing tests to include extensions, add saveK tests |
| `apps/mist/src/sources/tdx.source.ts` | Modify | Add saveK no-op implementation |
| `apps/mist/src/sources/tdx.source.spec.ts` | Modify | Add saveK test |
| `apps/mist/src/collector/collector.service.ts` | Modify | Remove saveKData, delegate to source.saveK |
| `apps/mist/src/collector/collector.service.spec.ts` | Modify | Update mocks and assertions to use source.saveK |
| `apps/mist/src/collector/collector.module.ts` | Modify | Add KExtensionEf to TypeOrmModule.forFeature |

---

### Task 1: Add extension types and saveK to interface

**Files:**
- Modify: `apps/mist/src/sources/source-fetcher.interface.ts`

- [ ] **Step 1: Add extension types and update interfaces**

Add the three platform extension interfaces, add `extensions` field to `KData`, and add `saveK` method to `ISourceFetcher`. Import `Security` from `@app/shared-data`.

The final file should be:

```ts
import { Period, Security } from '@app/shared-data';

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

export interface ISourceFetcher {
  fetchK(params: KFetchParams): Promise<KData[]>;
  saveK(data: KData[], security: Security, period: Period): Promise<void>;
  isSupportedPeriod(period: Period): boolean;
}

export interface KFetchParams {
  code: string;
  formatCode: string;
  period: number;
  startDate: Date;
  endDate: Date;
}

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
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit --project apps/mist/tsconfig.app.json 2>&1 | head -30`

Expected: Compilation errors in `collector.service.ts` and source files (they don't implement `saveK` yet). That's expected — we'll fix those in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/sources/source-fetcher.interface.ts
git commit -m "feat: add extension types and saveK to ISourceFetcher interface"
```

---

### Task 2: Implement EastMoneySource extensions and saveK

**Files:**
- Modify: `apps/mist/src/sources/east-money.source.ts`
- Modify: `apps/mist/src/sources/east-money.source.spec.ts`
- Modify: `apps/mist/src/collector/collector.module.ts`

- [ ] **Step 1: Update east-money.source.ts — imports and constructor**

Add `DataSource as TypeOrmDataSource` (aliased to avoid conflict with the enum) to imports. Inject only the TypeORM `DataSource` — no individual repositories needed since `saveK()` uses `manager.create()`/`manager.save()` inside transactions.

```ts
// Add to imports
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { K, KExtensionEf, Security } from '@app/shared-data';

// Add to constructor parameters (after periodMappingService)
private readonly typeOrmDataSource: TypeOrmDataSource,
```

- [ ] **Step 2: Update fetchPeriod to fill extensions**

In `fetchPeriod()`, add `extensions` to the returned KData. The `SecurityPeriodVo` already has fields `涨跌幅`, `涨跌额`, `振幅`, `换手率` that map directly to `EfExtension`:

```ts
return response.data.map(
  (item): KData => ({
    timestamp: new Date(item['时间']),
    open: Number(item['开盘']),
    high: Number(item['最高']),
    low: Number(item['最低']),
    close: Number(item['收盘']),
    volume: Number(item['成交量']),
    amount: item['成交额'] ? Number(item['成交额']) : undefined,
    period,
    extensions: {
      amplitude: item['振幅'] ?? undefined,
      changePct: item['涨跌幅'] ?? undefined,
      changeAmt: item['涨跌额'] ?? undefined,
      turnoverRate: item['换手率'] ?? undefined,
    } as EfExtension,
  }),
);
```

Note: `fetchDaily()` does NOT get extension data from the `stock_zh_index_daily_em` API — leave `extensions` undefined for daily data.

- [ ] **Step 3: Add saveK method to EastMoneySource**

The method uses a transaction with `manager.create()`/`manager.save()`. Extension entity creation is guarded — only create `KExtensionEf` rows when the corresponding `KData` has `extensions` defined (i.e., minute-level data, not daily):

```ts
async saveK(data: KData[], security: Security, period: Period): Promise<void> {
  if (data.length === 0) return;

  await this.typeOrmDataSource.transaction(async (manager) => {
    // Step 1: Save base K entities
    const kEntities = data.map((d) =>
      manager.create(K, {
        security,
        source: DataSource.EAST_MONEY,
        period,
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: BigInt(Math.round(d.volume)),
        amount: d.amount || 0,
      }),
    );
    const savedKs = await manager.save(K, kEntities);

    // Step 2: Save extension entities (only for items with extensions)
    const itemsWithExt = savedKs
      .map((k, i) => ({ k, ext: data[i].extensions as EfExtension | undefined }))
      .filter(({ ext }) => ext != null);

    if (itemsWithExt.length > 0) {
      const extensions = itemsWithExt.map(({ k, ext }) =>
        manager.create(KExtensionEf, {
          k,
          fullCode: ext!.fullCode ?? '',
          amplitude: ext!.amplitude ?? 0,
          changePct: ext!.changePct ?? 0,
          changeAmt: ext!.changeAmt ?? 0,
          turnoverRate: ext!.turnoverRate ?? 0,
        }),
      );
      await manager.save(KExtensionEf, extensions);
    }
  });
}
```

- [ ] **Step 4: Update collector.module.ts**

Add `KExtensionEf` to `TypeOrmModule.forFeature` so TypeORM can resolve it in transactions. Keep `K` in the list — it's still used by other services in the module.

```ts
// Update import
import { K, KExtensionEf, Security, SecuritySourceConfig } from '@app/shared-data';

// Update TypeOrmModule.forFeature (line 19)
TypeOrmModule.forFeature([K, KExtensionEf, Security, SecuritySourceConfig]),
```

- [ ] **Step 5: Update east-money.source.spec.ts**

Add TypeORM DataSource mock to the test module providers:

```ts
// Add import
import { getRepositoryToken } from '@nestjs/typeorm';
import { K, KExtensionEf } from '@app/shared-data';

// Add to providers array in beforeEach, after PeriodMappingService:
{
  provide: getRepositoryToken(K),
  useValue: { create: jest.fn(), save: jest.fn() },
},
{
  provide: getRepositoryToken(KExtensionEf),
  useValue: { create: jest.fn(), save: jest.fn() },
},
{
  provide: 'TypeOrmDataSource',
  useValue: {
    transaction: jest.fn((cb) =>
      cb({
        create: jest.fn((_, data) => data),
        save: jest.fn((_, entities) => Promise.resolve(entities)),
      }),
    ),
  },
},
```

Note: `DataSource` from TypeORM needs to be provided via the injection token. Since the constructor injects it by class type, use:
```ts
import { DataSource as TypeOrmDataSource } from 'typeorm';
// In providers:
{ provide: TypeOrmDataSource, useValue: { ... } },
```

Update existing period test mock data to include extension source fields (`涨跌幅`, `涨跌额`, `振幅`, `换手率`) and update expected results to include `extensions`.

- [ ] **Step 6: Add saveK tests to east-money.source.spec.ts**

Add a new `describe('saveK')` block:

```ts
describe('saveK', () => {
  it('should save base K and extension entities in a transaction', async () => {
    const mockData: KData[] = [
      {
        timestamp: new Date('2024-01-01T09:30:00.000Z'),
        open: 10.5,
        high: 11.0,
        low: 10.3,
        close: 10.8,
        volume: 1000000,
        period: Period.ONE_MIN,
        extensions: {
          amplitude: 2.5,
          changePct: 1.2,
          changeAmt: 0.13,
          turnoverRate: 0.5,
        } as EfExtension,
      },
    ];

    const mockSecurity = { id: 1, code: '000001' } as Security;

    await service.saveK(mockData, mockSecurity, Period.ONE_MIN);

    expect(mockTypeOrmDataSource.transaction).toHaveBeenCalled();
  });

  it('should be a no-op for empty data', async () => {
    await service.saveK([], {} as Security, Period.ONE_MIN);
    expect(mockTypeOrmDataSource.transaction).not.toHaveBeenCalled();
  });

  it('should skip extension creation when extensions are undefined (daily data)', async () => {
    const mockData: KData[] = [
      {
        timestamp: new Date('2024-01-01'),
        open: 3000,
        high: 3050,
        low: 2980,
        close: 3020,
        volume: 5000000,
        period: Period.DAY,
        // no extensions
      },
    ];

    await service.saveK(mockData, {} as Security, Period.DAY);
    expect(mockTypeOrmDataSource.transaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test -- --testPathPattern='east-money.source.spec' --no-coverage`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/mist/src/sources/east-money.source.ts apps/mist/src/sources/east-money.source.spec.ts apps/mist/src/collector/collector.module.ts
git commit -m "feat: implement EastMoneySource extensions and saveK with transaction"
```

---

### Task 3: Add saveK to TdxSource

**Files:**
- Modify: `apps/mist/src/sources/tdx.source.ts`
- Modify: `apps/mist/src/sources/tdx.source.spec.ts`

- [ ] **Step 1: Add saveK no-op to TdxSource**

Import `Security` from `@app/shared-data` (update existing import to add it) and add the `saveK` method:

```ts
// Update import (line 8) — add Security
import { DataSource, Period, Security } from '@app/shared-data';

// Add to class body (after fetchK, before isSupportedPeriod):
async saveK(_data: KData[], _security: Security, _period: Period): Promise<void> {
  // TDX data fetching not yet implemented — nothing to save
}
```

- [ ] **Step 2: Add saveK test to tdx.source.spec.ts**

```ts
describe('saveK', () => {
  it('should be a no-op for empty data', async () => {
    await expect(
      service.saveK([], {} as Security, Period.ONE_MIN),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test -- --testPathPattern='tdx.source.spec' --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/sources/tdx.source.ts apps/mist/src/sources/tdx.source.spec.ts
git commit -m "feat: add saveK no-op to TdxSource"
```

---

### Task 4: Refactor CollectorService to delegate saving

**Files:**
- Modify: `apps/mist/src/collector/collector.service.ts`
- Modify: `apps/mist/src/collector/collector.service.spec.ts`

- [ ] **Step 1: Update collector.service.ts — remove saveKData, delegate to source**

**a) In `collectKForSource()` (line 124):** Replace
```ts
await this.saveKData(security, kLineData, dataSource, period);
```
with:
```ts
await sourceFetcher.saveK(kLineData, security, period);
```

**b) In `saveRawKData()` (line 154-161):** Replace the entire method body. The method needs to look up the source fetcher itself since it doesn't have one in scope:
```ts
async saveRawKData(
  security: Security,
  kLineData: KData[],
  dataSource: DataSource,
  period: Period,
): Promise<void> {
  const sourceFetcher = this.sources.get(dataSource);
  if (!sourceFetcher) {
    throw new BadRequestException(
      `Data source ${dataSource} is not available`,
    );
  }
  await sourceFetcher.saveK(kLineData, security, period);
}
```

**c) In `collectK()` (line 230):** Replace
```ts
await this.saveKData(security, kLineData, dataSource, period);
```
with:
```ts
await sourceFetcher.saveK(kLineData, security, period);
```

**d) Delete the entire `saveKData()` private method** (lines 241-265).

**e) Remove `@InjectRepository(K)` and `kRepository` from the constructor** (lines 29-30). Remove `K` from the import at line 4 (keep `Security`, `SecuritySourceConfig`, etc.). Keep `Repository` import for `Security`.

- [ ] **Step 2: Update collector.service.spec.ts — add saveK to mocks, update assertions**

**a) Add `saveK` to mock source objects** (lines 29-37):
```ts
const mockEastMoneySource = {
  fetchK: jest.fn(),
  saveK: jest.fn(),
  isSupportedPeriod: jest.fn(),
};

const mockTdxSource = {
  fetchK: jest.fn(),
  saveK: jest.fn(),
  isSupportedPeriod: jest.fn(),
};
```

**b) Remove `getRepositoryToken(K)` provider** from the test module (lines 55-58) since `kRepository` is no longer injected. Keep `getRepositoryToken(Security)` and `getRepositoryToken(SecuritySourceConfig)`.

**c) Update assertions** — replace all `mockKRepository.create` and `mockKRepository.save` expectations with `mockEastMoneySource.saveK` or `mockTdxSource.saveK`:

- In `collectK > should successfully collect and save` (line 157-158): Replace
  ```ts
  expect(mockKRepository.create).toHaveBeenCalledTimes(2);
  expect(mockKRepository.save).toHaveBeenCalledTimes(1);
  ```
  with:
  ```ts
  expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
    mockKData,
    mockStock,
    Period.ONE_MIN,
  );
  ```

- In `collectKForSource > should collect K-line data...` (line 424): Replace
  ```ts
  expect(mockKRepository.save).toHaveBeenCalled();
  ```
  with:
  ```ts
  expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
    mockKData,
    mockStock,
    Period.ONE_MIN,
  );
  ```

- In `collectKForSource > beforeEach` (lines 401-402): Remove `mockKRepository.create.mockImplementation` and `mockKRepository.save.mockResolvedValue` — no longer relevant. Add `mockEastMoneySource.saveK.mockResolvedValue(undefined)`.

- In `saveRawKData > should save raw K-line data` (lines 504-515): Replace the entire test to verify `mockEastMoneySource.saveK` is called:
  ```ts
  it('should delegate to source saveK', async () => {
    mockEastMoneySource.saveK.mockResolvedValue(undefined);

    await service.saveRawKData(
      mockSecurity,
      mockRawData,
      DataSource.EAST_MONEY,
      Period.ONE_MIN,
    );

    expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
      mockRawData,
      mockSecurity,
      Period.ONE_MIN,
    );
  });
  ```

- In `Data Source Selection` tests (lines 568-569, 620-621): Remove `mockKRepository.create.mockImplementation` and `mockKRepository.save.mockResolvedValue`. Add `mockTdxSource.saveK.mockResolvedValue(undefined)` and `mockEastMoneySource.saveK.mockResolvedValue(undefined)` respectively.

**d) Remove or update dead tests**: The `getCollectionStatus` and `removeDuplicateData` describe blocks (lines 214-361) test methods that do not exist in the current `CollectorService`. These are pre-existing dead tests. Remove both `describe` blocks entirely.

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/xiyugao/code/mist/mist && npx tsc --noEmit --project apps/mist/tsconfig.app.json 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Run collector tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test -- --testPathPattern='collector.service.spec' --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/collector/collector.service.ts apps/mist/src/collector/collector.service.spec.ts
git commit -m "refactor: delegate K-line persistence to Source layer"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all unit tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test --no-coverage 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run lint 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 3: Verify build**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run build 2>&1 | tail -20`
Expected: Build succeeds
