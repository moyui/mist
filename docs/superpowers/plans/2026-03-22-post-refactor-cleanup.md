# Post-Refactor Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix TypeScript property initialization errors and remove unused code after three database refactors.

**Architecture:** Mixed strategy - use `!` assertion for framework-managed properties (TypeORM), add default values for data columns, use `!` for DTO/VO properties that are externally populated.

**Tech Stack:** TypeScript, TypeORM, NestJS, pnpm

---

## File Structure

**Files to Modify:**
- 13 entity files (libs/shared-data, apps/mist/src/chan, apps/mist/src/stock, apps/schedule)
- 3 VO files (libs/shared-data/src/vo, apps/mist/src/k/vo)
- 33 DTO files (libs/shared-data/src/dto, apps/*/dto)

**Files to Delete:**
- 3 unused enum/test files
- 1 backup file

---

## Task 1: Fix Entity Property Initialization - libs/shared-data/entities

### Task 1.1: Fix k.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/k.entity.ts`

- [ ] **Step 1: Read current file**

Run: `cat /Users/xiyugao/code/mist/mist/libs/shared-data/src/entities/k.entity.ts`

- [ ] **Step 2: Add `!` to TypeORM-managed properties**

Edit `libs/shared-data/src/entities/k.entity.ts`:

Find these properties and add `!`:
- `id: number;` → `id!: number;`
- `security: Security;` → `security!: Security;`
- `createdAt: Date;` → `createdAt!: Date;`
- `updatedAt: Date;` → `updatedAt!: Date;`
- `marketExtensionEf: KExtensionEf;` → `marketExtensionEf!: KExtensionEf;`
- `marketExtensionTdx: KExtensionTdx;` → `marketExtensionTdx!: KExtensionTdx;`
- `marketExtensionMqmt: KExtensionMqmt;` → `marketExtensionMqmt!: KExtensionMqmt;`

- [ ] **Step 3: Add default values to data columns**

Edit `libs/shared-data/src/entities/k.entity.ts`:

Find these properties and add default values:
- `source: DataSource;` → `source: DataSource = DataSource.EAST_MONEY;`
- `period: KPeriod;` → `period: KPeriod = KPeriod.DAILY;`
- `timestamp: Date;` → `timestamp: Date = new Date();`
- `open: number;` → `open: number = 0;`
- `high: number;` → `high: number = 0;`
- `low: number;` → `low: number = 0;`
- `close: number;` → `close: number = 0;`
- `volume: bigint;` → `volume: bigint = 0n;`
- `amount: number;` → `amount: number = 0;`
- `securityId: number;` → `securityId: number = 0;`

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run build`

Expected: No TypeScript errors for k.entity.ts

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/entities/k.entity.ts
git commit -m "fix: add property initialization to k.entity.ts"
```

---

### Task 1.2: Fix security.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/security.entity.ts`

- [ ] **Step 1: Add `!` to TypeORM-managed properties**

Edit `libs/shared-data/src/entities/security.entity.ts`:

Add `!` to:
- `id: number;` → `id!: number;`
- `createdAt: Date;` → `createdAt!: Date;`
- `updatedAt: Date;` → `updatedAt!: Date;`
- `sourceConfigs: SecuritySourceConfig[];` → `sourceConfigs!: SecuritySourceConfig[];`
- `marketDataBars: MarketDataBar[];` → `marketDataBars!: MarketDataBar[];`

- [ ] **Step 2: Add default values to data columns**

Edit `libs/shared-data/src/entities/security.entity.ts`:

Add default values:
- `code: string;` → `code: string = '';`
- `name: string;` → `name: string = '';`
- `type: SecurityType;` → `type: SecurityType = SecurityType.STOCK;`
- `exchange: string;` → `exchange: string = '';`
- `status: SecurityStatus;` → `status: SecurityStatus = SecurityStatus.ACTIVE;`

- [ ] **Step 3: Verify and commit**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run build`

```bash
git add libs/shared-data/src/entities/security.entity.ts
git commit -m "fix: add property initialization to security.entity.ts"
```

---

### Task 1.3: Fix security-source-config.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/security-source-config.entity.ts`

- [ ] **Step 1: Add `!` to TypeORM properties**

Add `!` to:
- `id: number;` → `id!: number;`
- `security: Security;` → `security!: Security;`
- `createdAt: Date;` → `createdAt!: Date;`
- `updatedAt: Date;` → `updatedAt!: Date;`

- [ ] **Step 2: Add default values**

Add default values:
- `source: DataSource;` → `source: DataSource = DataSource.EAST_MONEY;`
- `formatCode: string;` → `formatCode: string = '';`
- `priority: number;` → `priority: number = 0;`
- `enabled: boolean;` → `enabled: boolean = true;`

- [ ] **Step 3: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/entities/security-source-config.entity.ts
git commit -m "fix: add property initialization to security-source-config.entity.ts"
```

---

### Task 1.4: Fix k-extension-ef.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/k-extension-ef.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file:
- `id: number;` → `id!: number;`
- `marketDataBar: K;` → `marketDataBar!: K;`
- `createdAt: Date;` → `createdAt!: Date;`
- `amplitude: number;` → `amplitude: number = 0;`
- `changePct: number;` → `changePct: number = 0;`
- `changeAmt: number;` → `changeAmt: number = 0;`
- `turnoverRate: number;` → `turnoverRate: number = 0;`

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/entities/k-extension-ef.entity.ts
git commit -m "fix: add property initialization to k-extension-ef.entity.ts"
```

---

### Task 1.5: Fix k-extension-tdx.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/k-extension-tdx.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file:
- `id: number;` → `id!: number;`
- `marketDataBar: K;` → `marketDataBar!: K;`
- `createdAt: Date;` → `createdAt!: Date;`
- `forwardFactor: number;` → `forwardFactor: number = 0;`

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/entities/k-extension-tdx.entity.ts
git commit -m "fix: add property initialization to k-extension-tdx.entity.ts"
```

---

### Task 1.6: Fix k-extension-mqmt.entity.ts

**Files:**
- Modify: `libs/shared-data/src/entities/k-extension-mqmt.entity.ts`

- [ ] **Step 1: Add `!` to TypeORM properties**

Edit file:
- `id: number;` → `id!: number;`
- `marketDataBar: K;` → `marketDataBar!: K;`
- `createdAt: Date;` → `createdAt!: Date;`

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/entities/k-extension-mqmt.entity.ts
git commit -m "fix: add property initialization to k-extension-mqmt.entity.ts"
```

---

## Task 2: Fix Entity Property Initialization - apps/mist/src/chan/entities

### Task 2.1: Fix chan-fenxings.entity.ts

**Files:**
- Modify: `apps/mist/src/chan/entities/chan-fenxings.entity.ts`

- [ ] **Step 1: Add `!` to TypeORM properties**

Add `!` to:
- `id: number;` → `id!: number;`
- `security: Security;` → `security!: Security;`
- `createdAt: Date;` → `createdAt!: Date;`
- `updatedAt: Date;` → `updatedAt!: Date;`

- [ ] **Step 2: Add default values**

Add default values:
- `period: Period;` → `period: Period = Period.FIVE;`
- `dataTable: Table;` → `dataTable: Table = Table.IndexDaily;`
- `type: FenxingType;` → `type: FenxingType = FenxingType.TOP;`
- `trend: TrendDirection;` → `trend: TrendDirection = TrendDirection.UNKNOWN;`
- `status: boolean;` → `status: boolean = false;`
- `high: number;` → `high: number = 0;`
- `low: number;` → `low: number = 0;`
- `mergeCount: number;` → `mergeCount: number = 0;`

- [ ] **Step 3: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/entities/chan-fenxings.entity.ts
git commit -m "fix: add property initialization to chan-fenxings.entity.ts"
```

---

### Task 2.2: Fix chan-index-daily.entity.ts

**Files:**
- Modify: `apps/mist/src/chan/entities/chan-index-daily.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file (similar pattern as Task 2.1):
- Add `!` to: `id`, `security`, `createdAt`, `updatedAt`
- Add default values to all `@Column` properties

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/entities/chan-index-daily.entity.ts
git commit -m "fix: add property initialization to chan-index-daily.entity.ts"
```

---

### Task 2.3: Fix chan-bis.entity.ts

**Files:**
- Modify: `apps/mist/src/chan/entities/chan-bis.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file:
- Add `!` to: `id`, `security`, `createdAt`, `updatedAt`
- Add default values to all `@Column` properties

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/entities/chan-bis.entity.ts
git commit -m "fix: add property initialization to chan-bis.entity.ts"
```

---

### Task 2.4: Fix chan-states.entity.ts

**Files:**
- Modify: `apps/mist/src/chan/entities/chan-states.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file:
- Add `!` to: `id`, `security`, `createdAt`, `updatedAt`
- Add default values to all `@Column` properties

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/entities/chan-states.entity.ts
git commit -m "fix: add property initialization to chan-states.entity.ts"
```

---

### Task 2.5: Fix chan-index-period.entity.ts

**Files:**
- Modify: `apps/mist/src/chan/entities/chan-index-period.entity.ts`

- [ ] **Step 1: Add `!` and default values**

Edit file:
- Add `!` to: `id`, `security`, `createdAt`, `updatedAt`
- Add default values to all `@Column` properties

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/entities/chan-index-period.entity.ts
git commit -m "fix: add property initialization to chan-index-period.entity.ts"
```

---

## Task 3: Fix Entity Property Initialization - Other Apps

### Task 3.1: Fix apps/mist/src/stock/stock.entity.ts

**Files:**
- Modify: `apps/mist/src/stock/stock.entity.ts`

- [ ] **Step 1: Read and fix entity**

Add `!` to TypeORM properties, add default values to `@Column` properties

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/stock/stock.entity.ts
git commit -m "fix: add property initialization to stock.entity.ts"
```

---

### Task 3.2: Fix apps/schedule/src/run/entities/run.entity.ts

**Files:**
- Modify: `apps/schedule/src/run/entities/run.entity.ts`

- [ ] **Step 1: Read file content**

Run: `cat /Users/xiyugao/code/mist/mist/apps/schedule/src/run/entities/run.entity.ts`

Note: This file may be nearly empty (just `export class Run {}`). If so, no changes needed.

- [ ] **Step 2: If empty, skip; else fix and commit**

If file has properties, add `!` and default values. If empty, no action needed.

---

## Task 4: Fix VO Property Initialization

### Task 4.1: Fix libs/shared-data/src/vo/k.vo.ts

**Files:**
- Modify: `libs/shared-data/src/vo/k.vo.ts`

- [ ] **Step 1: Read current VO**

Run: `cat /Users/xiyugao/code/mist/mist/libs/shared-data/src/vo/k.vo.ts`

- [ ] **Step 2: Add `!` to all properties**

Edit `libs/shared-data/src/vo/k.vo.ts`:

Add `!` to all 19 properties (12 required + 7 optional):
```typescript
export class KVo {
  '时间'!: string;
  '开盘'!: number;
  '最高'!: number;
  '最低'!: number;
  '收盘'!: number;
  '成交量'!: number;
  '成交额'!: number;
  '数据源'!: string;
  '周期'!: string;
  '证券代码'!: string;
  '证券名称'!: string;
  '交易所'!: string;
  '涨跌幅'?: number = 0;
  '涨跌额'?: number = 0;
  '振幅'?: number = 0;
  '换手率'?: number = 0;
  '前收盘'?: number = 0;
  '今开盘'?: number = 0;
  '今收盘'?: number = 0;
}
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/vo/k.vo.ts
git commit -m "fix: add property initialization to k.vo.ts"
```

---

### Task 4.2: Fix libs/shared-data/src/vo/index-period.vo.ts

**Files:**
- Modify: `libs/shared-data/src/vo/index-period.vo.ts`

- [ ] **Step 1: Add `!` to all properties**

Edit file, add `!` to all properties:
```typescript
export class IndexPeriodVo {
  '时间'!: string;
  '开盘'!: number;
  '收盘'!: number;
  '最高'!: number;
  '最低'!: number;
  '涨跌幅'?: number = 0;
  '涨跌额'?: number = 0;
  '成交量'!: number;
  '成交额'!: number;
  '振幅'?: number = 0;
  '换手率'?: number = 0;
}
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/vo/index-period.vo.ts
git commit -m "fix: add property initialization to index-period.vo.ts"
```

---

### Task 4.3: Fix apps/mist/src/k/vo/bars.vo.ts

**Files:**
- Modify: `apps/mist/src/k/vo/bars.vo.ts`

- [ ] **Step 1: Add `!` to all properties**

Edit file:
```typescript
export class BarsVo {
  @ApiProperty({ description: 'Bar ID' })
  id!: number;

  @ApiProperty({ description: 'Highest price' })
  highest!: number;

  @ApiProperty({ description: 'Lowest price' })
  lowest!: number;

  @ApiProperty({ description: 'Open price' })
  open!: number;

  @ApiProperty({ description: 'Close price' })
  close!: number;

  @ApiProperty({ description: 'Symbol code' })
  symbol!: string;

  @ApiProperty({ description: 'Timestamp' })
  timestamp!: Date;

  @ApiProperty({ description: 'Amount' })
  amount!: number;
}
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/k/vo/bars.vo.ts
git commit -m "fix: add property initialization to bars.vo.ts"
```

---

## Task 5: Fix DTO Property Initialization - Batch 1 (libs/shared-data)

### Task 5.1: Fix all DTOs in libs/shared-data/src/dto

**Files:**
- Modify: All 8 DTO files in `libs/shared-data/src/dto/`

- [ ] **Step 1: Fix save-market-data.dto.ts**

Add `!` to all properties:
```typescript
code!: string;
source!: DataSource;
period!: KPeriod;
timestamp!: Date;
open!: number;
high!: number;
low!: number;
close!: number;
volume!: bigint;
amount!: number;
precision?: number = 0;
factor?: number = 0;
```

- [ ] **Step 2: Fix save-security.dto.ts**

Add `!` to all properties

- [ ] **Step 3: Fix query-market-data.dto.ts**

Add `!` to all properties

- [ ] **Step 4: Fix cron-index-daily.dto.ts**

Add `!` to all properties

- [ ] **Step 5: Fix cron-index-period.dto.ts**

Add `!` to all properties

- [ ] **Step 6: Fix index-daily.dto.ts**

Add `!` to all properties

- [ ] **Step 7: Fix index-period.dto.ts**

Add `!` to all properties

- [ ] **Step 8: Fix save-index-period.dto.ts**

Add `!` to all properties

- [ ] **Step 9: Verify and commit batch**

```bash
pnpm run build
git add libs/shared-data/src/dto/
git commit -m "fix: add property initialization to all DTOs in libs/shared-data"
```

---

## Task 6: Fix DTO Property Initialization - Batch 2 (apps/mist/src)

### Task 6.1: Fix DTOs in apps/mist/src/indicator/dto

**Files:**
- Modify: `apps/mist/src/indicator/dto/*.dto.ts` (8 files)

- [ ] **Step 1: Fix all indicator DTOs**

Add `!` to all properties in:
- k.dto.ts
- kdj.dto.ts
- macd.dto.ts
- rsi.dto.ts
- run-adx.dto.ts
- run-atr.dto.ts
- run-dualma.dto.ts
- run-kdj.dto.ts

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/indicator/dto/
git commit -m "fix: add property initialization to indicator DTOs"
```

---

### Task 6.2: Fix DTOs in apps/mist/src/chan/dto

**Files:**
- Modify: `apps/mist/src/chan/dto/*.dto.ts` (6 files)

- [ ] **Step 1: Fix all chan DTOs**

Add `!` to all properties in:
- create-bi.dto.ts
- create-chan.dto.ts
- create-channel.dto.ts
- merge-k.dto.ts
- update-bi.dto.ts
- update-chan.dto.ts

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/chan/dto/
git commit -m "fix: add property initialization to chan DTOs"
```

---

### Task 6.3: Fix DTOs in apps/mist/src/k, stock, data-collector, common

**Files:**
- Modify: Remaining DTOs in apps/mist/src

- [ ] **Step 1: Fix k/dto/query-bars.dto.ts**

Add `!` to all properties

- [ ] **Step 2: Fix stock/dto/*.dto.ts** (2 files)

Add `!` to all properties in:
- add-source.dto.ts
- init-stock.dto.ts

- [ ] **Step 3: Fix data-collector/dto/collect-kline.dto.ts**

Add `!` to all properties

- [ ] **Step 4: Fix common/dto/api-response.dto.ts**

Add `!` to all properties

- [ ] **Step 5: Verify and commit**

```bash
pnpm run build
git add apps/mist/src/k/dto/ apps/mist/src/stock/dto/ apps/mist/src/data-collector/dto/ apps/mist/src/common/dto/
git commit -m "fix: add property initialization to remaining mist app DTOs"
```

---

## Task 7: Fix DTO Property Initialization - Batch 3 (apps/saya, apps/schedule)

### Task 7.1: Fix DTOs in apps/saya

**Files:**
- Modify: All DTOs in `apps/saya/src/*/dto/`

- [ ] **Step 1: Fix saya DTOs**

Add `!` to all properties in:
- builder/dto/invoke.dto.ts
- llm/dto/create.dto.ts
- role/dto/router.dto.ts
- role/dto/state.dto.ts
- template/dto/apply.dto.ts
- tools/dto/local-service.dto.ts

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/saya/
git commit -m "fix: add property initialization to saya DTOs"
```

---

### Task 7.2: Fix DTOs in apps/schedule

**Files:**
- Modify: `apps/schedule/src/run/dto/*.dto.ts` (2 files)

- [ ] **Step 1: Fix schedule run DTOs**

Add `!` to all properties in:
- create-run.dto.ts
- update-run.dto.ts

- [ ] **Step 2: Verify and commit**

```bash
pnpm run build
git add apps/schedule/src/run/dto/
git commit -m "fix: add property initialization to schedule DTOs"
```

---

## Task 8: Delete Unused Files

### Task 8.1: Delete unused enum files

**Files:**
- Delete: `libs/shared-data/src/enums/index-data.enum.ts`
- Delete: `libs/shared-data/src/enums/stock-status.enum.ts`
- Delete: `libs/shared-data/src/enums/stock-status.enum.spec.ts`

- [ ] **Step 1: Verify files are unused**

Run:
```bash
cd /Users/xiyugao/code/mist/mist
grep -r "index-data\.enum\|DataType" --include="*.ts" libs/ apps/ | grep -v node_modules
grep -r "stock-status\.enum\|StockStatus" --include="*.ts" libs/ apps/ | grep -v node_modules
```

Expected: Only the files themselves, no actual usage

- [ ] **Step 2: Delete files**

```bash
rm libs/shared-data/src/enums/index-data.enum.ts
rm libs/shared-data/src/enums/stock-status.enum.ts
rm libs/shared-data/src/enums/stock-status.enum.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add libs/shared-data/src/enums/
git commit -m "chore: remove unused enum files (index-data, stock-status)"
```

---

### Task 8.2: Delete backup file

**Files:**
- Delete: `apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts.bak`

- [ ] **Step 1: Delete backup**

```bash
rm apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts.bak
```

- [ ] **Step 2: Commit**

```bash
git add apps/mist/src/migrations/
git commit -m "chore: remove migration backup file"
```

---

## Task 9: Update Exports

### Task 9.1: Clean up libs/shared-data/src/index.ts

**Files:**
- Modify: `libs/shared-data/src/index.ts`

- [ ] **Step 1: Read current exports**

Run: `cat /Users/xiyugao/code/mist/mist/libs/shared-data/src/index.ts`

- [ ] **Step 2: Remove exports for deleted files**

Edit `libs/shared-data/src/index.ts`, remove these lines:
```typescript
export * from './enums/stock-status.enum';
```

Note: Keep other exports even if deprecated (index-period, cron-index-*, etc.) as they're still used.

- [ ] **Step 3: Verify and commit**

```bash
pnpm run build
git add libs/shared-data/src/index.ts
git commit -m "chore: remove deleted enum exports from index.ts"
```

---

## Task 10: Final Verification

### Task 10.1: Full TypeScript compilation check

- [ ] **Step 1: Run build**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run build`

Expected: Build succeeds with no errors

- [ ] **Step 2: Check for any remaining errors**

If errors remain, review and fix them

---

### Task 10.2: Lint check

- [ ] **Step 1: Run linter**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run lint`

Expected: No lint errors (or only auto-fixable warnings)

- [ ] **Step 2: Auto-fix if possible**

Run: `pnpm run lint -- --fix`

---

### Task 10.3: Test verification

- [ ] **Step 1: Run tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test`

Expected: All tests pass

---

### Task 10.4: IDE verification

- [ ] **Step 1: Check IDE**

Open project in IDE and verify no red error indicators for:
- Property initialization errors
- Missing imports
- Type errors

---

## Task 11: Final Commit

- [ ] **Step 1: Review all changes**

Run: `git log --oneline -10`

Review the last 10 commits

- [ ] **Step 2: Create summary commit**

```bash
git add .
git commit -m "chore: complete post-refactor cleanup

- Fixed property initialization in 13 entity files
- Fixed property initialization in 3 VO files
- Fixed property initialization in 33 DTO files
- Removed 3 unused enum files
- Removed 1 backup migration file
- Updated exports in index.ts
- All TypeScript compilation errors resolved
- All tests passing"
```

---

## Completion Criteria

- [ ] All entity files have proper property initialization
- [ ] All VO files have proper property initialization
- [ ] All DTO files have proper property initialization
- [ ] Unused files deleted
- [ ] Exports updated
- [ ] TypeScript compilation succeeds with no errors
- [ ] Lint passes
- [ ] All tests pass
- [ ] IDE shows no property initialization errors

---

## Notes

- **Default Values:** Number → 0, String → '', bigint → 0n, boolean → false
- **Definite Assignment (!):** Use for TypeORM-managed and externally-populated properties
- **Incremental Commits:** Each task commits independently for easy rollback
- **Testing:** Run build after each batch to catch errors early

---

## Rollback Plan

If issues arise:
1. Identify problematic commit: `git log --oneline`
2. Revert specific commit: `git revert <commit-hash>`
3. Or reset to known good state: `git reset --hard <commit-hash>`
4. Re-apply fixes with corrected approach
