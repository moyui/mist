# Entity Rename Implementation Plan: MarketDataBar → K

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename MarketDataBar entity to K (K线) and BarPeriod enum to KPeriod for better alignment with Chinese market terminology.

**Architecture:** Refactor existing TypeORM entities and related code by renaming entities, enums, files, and updating all references while maintaining backward compatibility for API routes.

**Tech Stack:** NestJS, TypeORM, MySQL, TypeScript

---

## Prerequisites

Before starting this plan, ensure you have:
- Read the design document at `docs/superpowers/specs/2026-03-21-entity-rename-k.design.md`
- A working development environment with MySQL database
- All tests passing: `pnpm run test`

---

## Phase 1: Enum Rename (BarPeriod → KPeriod)

### Task 1: Rename Enum File

**Files:**
- Rename: `libs/shared-data/src/enums/bar-period.enum.ts` → `libs/shared-data/src/enums/k-period.enum.ts`
- Modify: `libs/shared-data/src/enums/k-period.enum.ts`
- Modify: `libs/shared-data/src/index.ts`

- [ ] **Step 1: Rename the enum file**

```bash
cd /Users/xiyugao/code/mist/mist/libs/shared-data/src/enums
mv bar-period.enum.ts k-period.enum.ts
```

Expected: File renamed successfully

- [ ] **Step 2: Update enum name in the file**

Edit `libs/shared-data/src/enums/k-period.enum.ts`:

```typescript
export enum KPeriod {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  FIFTEEN_MIN = '15min',
  THIRTY_MIN = '30min',
  SIXTY_MIN = '60min',
  DAILY = 'daily',
}
```

Change: `export enum BarPeriod` → `export enum KPeriod`

- [ ] **Step 3: Update export in index.ts**

Edit `libs/shared-data/src/index.ts`:

Find the line:
```typescript
export * from './enums/bar-period.enum';
```

Replace with:
```typescript
export * from './enums/k-period.enum';
```

- [ ] **Step 4: Update test file enum reference**

Edit `libs/shared-data/src/enums/k-period.enum.spec.ts`:

Change:
```typescript
import { BarPeriod } from './bar-period.enum';

describe('BarPeriod', () => {
```

To:
```typescript
import { KPeriod } from './k-period.enum';

describe('KPeriod', () => {
```

And update all references in the test:
```typescript
  it('should have correct values', () => {
    expect(KPeriod.ONE_MIN).toBe('1min');
    expect(KPeriod.FIVE_MIN).toBe('5min');
    expect(KPeriod.FIFTEEN_MIN).toBe('15min');
    expect(KPeriod.THIRTY_MIN).toBe('30min');
    expect(KPeriod.SIXTY_MIN).toBe('60min');
    expect(KPeriod.DAILY).toBe('daily');
  });

  it('should have six periods', () => {
    const values = Object.values(KPeriod);
    expect(values).toHaveLength(6);
  });
```

- [ ] **Step 5: Verify enum test passes**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm test -- libs/shared-data/src/enums/k-period.enum.spec.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit enum rename**

```bash
git add libs/shared-data/src/enums/
git commit -m "refactor: rename BarPeriod enum to KPeriod"
```

---

### Task 2: Update BarPeriod References in Indicator DTOs

**Files:**
- Modify: `apps/mist/src/indicator/dto/k.dto.ts`
- Modify: `apps/mist/src/indicator/dto/macd.dto.ts`
- Modify: `apps/mist/src/indicator/dto/rsi.dto.ts`
- Modify: `apps/mist/src/indicator/dto/kdj.dto.ts`

- [ ] **Step 1: Update k.dto.ts**

Edit `apps/mist/src/indicator/dto/k.dto.ts`:

Change:
```typescript
import { BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { KPeriod } from '@app/shared-data';
```

And update the decorator:
```typescript
  @IsEnum(KPeriod, {
```

- [ ] **Step 2: Update macd.dto.ts**

Edit `apps/mist/src/indicator/dto/macd.dto.ts`:

Change:
```typescript
import { BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { KPeriod } from '@app/shared-data';
```

And update the decorator:
```typescript
  @IsEnum(KPeriod, {
```

- [ ] **Step 3: Update rsi.dto.ts**

Edit `apps/mist/src/indicator/dto/rsi.dto.ts`:

Change:
```typescript
import { BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { KPeriod } from '@app/shared-data';
```

And update the decorator:
```typescript
  @IsEnum(KPeriod, {
```

- [ ] **Step 4: Update kdj.dto.ts**

Edit `apps/mist/src/indicator/dto/kdj.dto.ts`:

Change:
```typescript
import { BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { KPeriod } from '@app/shared-data';
```

And update the decorator:
```typescript
  @IsEnum(KPeriod, {
```

- [ ] **Step 5: Verify compilation**

```bash
pnpm run build
```

Expected: No compilation errors

- [ ] **Step 6: Commit indicator DTO updates**

```bash
git add apps/mist/src/indicator/dto/
git commit -m "refactor: update Indicator DTOs to use KPeriod"
```

---

### Task 3: Update BarPeriod References in Sources

**Files:**
- Modify: `apps/mist/src/sources/tdx.source.ts`
- Modify: `apps/mist/src/sources/east-money.source.ts`

- [ ] **Step 1: Update tdx.source.ts**

Edit `apps/mist/src/sources/tdx.source.ts`:

Change:
```typescript
import { PeriodMapping, DataSource, BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { PeriodMapping, DataSource, KPeriod } from '@app/shared-data';
```

Update the helper function signature:
```typescript
  private periodToKLinePeriod(period: Period): KPeriod {
    const mapping: Record<Period, KPeriod> = {
      [Period.One]: KPeriod.ONE_MIN,
      [Period.FIVE]: KPeriod.FIVE_MIN,
      [Period.FIFTEEN]: KPeriod.FIFTEEN_MIN,
      [Period.THIRTY]: KPeriod.THIRTY_MIN,
      [Period.SIXTY]: KPeriod.SIXTY_MIN,
      [Period.DAY]: KPeriod.DAILY,
      [Period.WEEK]: KPeriod.DAILY,
      [Period.MONTH]: KPeriod.DAILY,
      [Period.QUARTER]: KPeriod.DAILY,
      [Period.YEAR]: KPeriod.DAILY,
    };
    return mapping[period];
  }
```

- [ ] **Step 2: Update east-money.source.ts**

Edit `apps/mist/src/sources/east-money.source.ts`:

Change:
```typescript
import { PeriodMapping, DataSource, BarPeriod } from '@app/shared-data';
```

To:
```typescript
import { PeriodMapping, DataSource, KPeriod } from '@app/shared-data';
```

Update the helper function signature:
```typescript
  private periodToKLinePeriod(period: Period): KPeriod {
    const mapping: Record<Period, KPeriod> = {
      [Period.One]: KPeriod.ONE_MIN,
      [Period.FIVE]: KPeriod.FIVE_MIN,
      [Period.FIFTEEN]: KPeriod.FIFTEEN_MIN,
      [Period.THIRTY]: KPeriod.THIRTY_MIN,
      [Period.SIXTY]: KPeriod.SIXTY_MIN,
      [Period.DAY]: KPeriod.DAILY,
      [Period.WEEK]: KPeriod.DAILY,
      [Period.MONTH]: KPeriod.DAILY,
      [Period.QUARTER]: KPeriod.DAILY,
      [Period.YEAR]: KPeriod.DAILY,
    };
    return mapping[period];
  }
```

- [ ] **Step 3: Update source test**

Edit `apps/mist/src/sources/tdx.source.spec.ts`:

Find and replace all `BarPeriod` with `KPeriod`

- [ ] **Step 4: Run tests**

```bash
pnpm test -- apps/mist/src/sources/
```

Expected: All tests pass

- [ ] **Step 5: Commit source updates**

```bash
git add apps/mist/src/sources/
git commit -m "refactor: update Sources to use KPeriod"
```

---

### Task 4: Update BarPeriod References in Utils

**Files:**
- Modify: `libs/shared-data/src/utils/period-mapping.util.ts`
- Modify: `libs/shared-data/src/utils/period-mapping.util.spec.ts`

- [ ] **Step 1: Update period-mapping.util.ts**

Edit `libs/shared-data/src/utils/period-mapping.util.ts`:

Find all `BarPeriod` and replace with `KPeriod`

- [ ] **Step 2: Update period-mapping.util.spec.ts**

Edit `libs/shared-data/src/utils/period-mapping.util.spec.ts`:

Change:
```typescript
import { BarPeriod } from '../enums/bar-period.enum';
```

To:
```typescript
import { KPeriod } from '../enums/k-period.enum';
```

And update all references in the test:
```typescript
    it('should convert 1min to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.ONE_MIN,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('1');
    });

    it('should convert daily to east money format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.DAILY,
        DataSource.EAST_MONEY,
      );
      expect(result).toBe('daily');
    });

    it('should convert 1min to tdx format', () => {
      const result = PeriodMapping.toSourceFormat(
        KPeriod.ONE_MIN,
        DataSource.TDX,
      );
      expect(result).toBe('1m');
    });

    it('should throw error for unsupported period', () => {
      expect(() => {
        PeriodMapping.toSourceFormat(KPeriod.FIFTEEN_MIN, DataSource.TDX);
      }).toThrow('Data source tdx does not support period 15min');
    });
```

- [ ] **Step 3: Run test**

```bash
pnpm test -- libs/shared-data/src/utils/period-mapping.util.spec.ts
```

Expected: All tests pass

- [ ] **Step 4: Commit utils updates**

```bash
git add libs/shared-data/src/utils/
git commit -m "refactor: update period-mapping to use KPeriod"
```

---

## Phase 2: Entity Rename (MarketDataBar → K)

### Task 5: Rename Main Entity File

**Files:**
- Rename: `libs/shared-data/src/entities/market-data-bar.entity.ts` → `libs/shared-data/src/entities/k.entity.ts`
- Modify: `libs/shared-data/src/entities/k.entity.ts`
- Modify: `libs/shared-data/src/entities/index.ts`
- Modify: `libs/shared-data/src/index.ts`

- [ ] **Step 1: Rename entity file**

```bash
cd /Users/xiyugao/code/mist/mist/libs/shared-data/src/entities
mv market-data-bar.entity.ts k.entity.ts
```

Expected: File renamed successfully

- [ ] **Step 2: Update entity class name**

Edit `libs/shared-data/src/entities/k.entity.ts`:

Change:
```typescript
export class MarketDataBar {
```

To:
```typescript
export class K {
```

- [ ] **Step 3: Update entities index**

Edit `libs/shared-data/src/entities/index.ts`:

Find:
```typescript
export * from './market-data-bar.entity';
```

Replace with:
```typescript
export * from './k.entity';
```

- [ ] **Step 4: Update main index**

Edit `libs/shared-data/src/index.ts`:

Find:
```typescript
export * from './entities/market-data-bar.entity';
```

Replace with:
```typescript
export * from './entities/k.entity';
```

- [ ] **Step 5: Verify compilation**

```bash
pnpm run build
```

Expected: Compilation fails (other files still reference MarketDataBar)

This is expected - we'll update references in next tasks

- [ ] **Step 6: Commit entity file rename**

```bash
git add libs/shared-data/src/entities/
git commit -m "refactor: rename MarketDataBar entity file to K"
```

---

### Task 6: Rename Extension Entity Files

**Files:**
- Rename: `libs/shared-data/src/entities/market-data-extension-ef.entity.ts` → `libs/shared-data/src/entities/k-extension-ef.entity.ts`
- Rename: `libs/shared-data/src/entities/market-data-extension-tdx.entity.ts` → `libs/shared-data/src/entities/k-extension-tdx.entity.ts`
- Rename: `libs/shared-data/src/entities/market-data-extension-mqmt.entity.ts` → `libs/shared-data/src/entities/k-extension-mqmt.entity.ts`
- Modify: All three extension entity files
- Modify: `libs/shared-data/src/entities/index.ts`

- [ ] **Step 1: Rename extension entity files**

```bash
cd /Users/xiyugao/code/mist/mist/libs/shared-data/src/entities
mv market-data-extension-ef.entity.ts k-extension-ef.entity.ts
mv market-data-extension-tdx.entity.ts k-extension-tdx.entity.ts
mv market-data-extension-mqmt.entity.ts k-extension-mqmt.entity.ts
```

Expected: Files renamed successfully

- [ ] **Step 2: Update k-extension-ef.entity.ts**

Edit `libs/shared-data/src/entities/k-extension-ef.entity.ts`:

Change:
```typescript
import { MarketDataBar } from './market-data-bar.entity';

export class MarketDataExtensionEf {
```

To:
```typescript
import { K } from './k.entity';

export class KExtensionEf {
```

And update the relation:
```typescript
  @ManyToOne(() => K, (bar) => bar.extensionEf, { onDelete: 'CASCADE' })
  bar: K;
```

- [ ] **Step 3: Update k-extension-tdx.entity.ts**

Edit `libs/shared-data/src/entities/k-extension-tdx.entity.ts`:

Change:
```typescript
import { MarketDataBar } from './market-data-bar.entity';

export class MarketDataExtensionTdx {
```

To:
```typescript
import { K } from './k.entity';

export class KExtensionTdx {
```

And update the relation:
```typescript
  @ManyToOne(() => K, (bar) => bar.extensionTdx, { onDelete: 'CASCADE' })
  bar: K;
```

- [ ] **Step 4: Update k-extension-mqmt.entity.ts**

Edit `libs/shared-data/src/entities/k-extension-mqmt.entity.ts`:

Change:
```typescript
import { MarketDataBar } from './market-data-bar.entity';

export class MarketDataExtensionMqmt {
```

To:
```typescript
import { K } from './k.entity';

export class KExtensionMqmt {
```

And update the relation:
```typescript
  @ManyToOne(() => K, (bar) => bar.extensionMqmt, { onDelete: 'CASCADE' })
  bar: K;
```

- [ ] **Step 5: Update K entity reverse relations**

Edit `libs/shared-data/src/entities/k.entity.ts`:

Update the @OneToMany decorators:
```typescript
  @OneToMany(() => KExtensionEf, (ext) => ext.bar)
  extensionEf: KExtensionEf[];

  @OneToMany(() => KExtensionTdx, (ext) => ext.bar)
  extensionTdx: KExtensionTdx[];

  @OneToMany(() => KExtensionMqmt, (ext) => ext.bar)
  extensionMqmt: KExtensionMqmt[];
```

- [ ] **Step 6: Update entities index**

Edit `libs/shared-data/src/entities/index.ts`:

Find:
```typescript
export * from './market-data-extension-ef.entity';
export * from './market-data-extension-tdx.entity';
export * from './market-data-extension-mqmt.entity';
```

Replace with:
```typescript
export * from './k-extension-ef.entity';
export * from './k-extension-tdx.entity';
export * from './k-extension-mqmt.entity';
```

- [ ] **Step 7: Update main index**

Edit `libs/shared-data/src/index.ts`:

Find:
```typescript
export * from './entities/market-data-extension-ef.entity';
export * from './entities/market-data-extension-tdx.entity';
export * from './entities/market-data-extension-mqmt.entity';
```

Replace with:
```typescript
export * from './entities/k-extension-ef.entity';
export * from './entities/k-extension-tdx.entity';
export * from './entities/k-extension-mqmt.entity';
```

- [ ] **Step 8: Commit extension entity renames**

```bash
git add libs/shared-data/src/entities/
git commit -m "refactor: rename extension entities to KExtension*"
```

---

### Task 7: Update Security Entity Relationships

**Files:**
- Modify: `libs/shared-data/src/entities/security.entity.ts`

- [ ] **Step 1: Update Security entity's @OneToMany relationship**

Edit `libs/shared-data/src/entities/security.entity.ts`:

Change the import:
```typescript
import { K } from './k.entity';
```

Update the @OneToMany decorator:
```typescript
  @OneToMany(() => K, (bar) => bar.security)
  ks: K[];
```

Change property name from `marketDataBars` to `ks`

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: May still have errors (other files not yet updated)

- [ ] **Step 3: Commit Security entity update**

```bash
git add libs/shared-data/src/entities/security.entity.ts
git commit -m "refactor: update Security entity relationship to K"
```

---

### Task 8: Update Module Registrations

**Files:**
- Modify: `libs/shared-data/src/shared-data.module.ts`
- Modify: `apps/mist/src/data-collector/data-collector.module.ts`

- [ ] **Step 1: Update shared-data.module.ts**

Edit `libs/shared-data/src/shared-data.module.ts`:

Change import:
```typescript
import { K } from './entities/k.entity';
```

Update TypeOrmModule.forFeature:
```typescript
    TypeOrmModule.forFeature([K, Security, SecuritySourceConfig]),
```

- [ ] **Step 2: Update data-collector.module.ts**

Edit `apps/mist/src/data-collector/data-collector.module.ts`:

Change import:
```typescript
import { K, Security } from '@app/shared-data';
```

Update TypeOrmModule.forFeature:
```typescript
  imports: [TypeOrmModule.forFeature([K, Security]), UtilsModule],
```

- [ ] **Step 3: Verify module compilation**

```bash
pnpm run build
```

Expected: No module-related compilation errors

- [ ] **Step 4: Commit module updates**

```bash
git add libs/shared-data/src/shared-data.module.ts apps/mist/src/data-collector/data-collector.module.ts
git commit -m "refactor: update module registrations to use K entity"
```

---

### Task 9: Update Entity References in Services and Controllers

**Files:**
- Modify: `apps/mist/src/data/data.service.ts`
- Modify: `apps/mist/src/data/data.controller.ts`
- Modify: `apps/mist/src/data/data.module.ts`
- Modify: `libs/shared-data/src/shared-data.service.ts`
- Modify: `apps/mist/src/data-collector/data-collector.service.ts`

- [ ] **Step 1: Update data.service.ts**

Edit `apps/mist/src/data/data.service.ts`:

Change imports:
```typescript
import {
  K,
  Security,
  KPeriod,
  SecurityType,
} from '@app/shared-data';
```

Update repository injection and usage:
```typescript
    @InjectRepository(K)
    private kRepository: Repository<K>,
```

And update all references:
```typescript
  async findBarsById(queryDto: any): Promise<K[]> {
```

- [ ] **Step 2: Update data.module.ts**

Edit `apps/mist/src/data/data.module.ts`:

Change:
```typescript
import { MarketDataBar, Security, SharedDataModule } from '@app/shared-data';
```

To:
```typescript
import { K, Security, SharedDataModule } from '@app/shared-data';
```

And update TypeOrmModule:
```typescript
    TypeOrmModule.forFeature([Security, K]),
```

- [ ] **Step 3: Update shared-data.service.ts**

Edit `libs/shared-data/src/shared-data.service.ts`:

Change imports:
```typescript
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Security, K } from './index';
import { KPeriod } from './enums/k-period.enum';
```

Update repository injection:
```typescript
    @InjectRepository(K)
    private kRepository: Repository<K>,
```

- [ ] **Step 4: Update data-collector.service.ts**

Edit `apps/mist/src/data-collector/data-collector.service.ts`:

Change imports and update all `MarketDataBar` to `K`

- [ ] **Step 5: Update data module files tests**

Edit `apps/mist/src/data/data.service.spec.ts`:

Change:
```typescript
import { Security, MarketDataBar } from '@app/shared-data';
```

To:
```typescript
import { Security, K } from '@app/shared-data';
```

And update repository tokens:
```typescript
        {
          provide: getRepositoryToken(K),
          useValue: {
            find: jest.fn(),
          },
        },
```

Edit `apps/mist/src/data/data.controller.spec.ts` similarly.

- [ ] **Step 6: Run tests**

```bash
pnpm test -- apps/mist/src/data/
```

Expected: All tests pass

- [ ] **Step 7: Commit service updates**

```bash
git add apps/mist/src/data/ libs/shared-data/src/shared-data.service.ts
git commit -m "refactor: update data services to use K entity"
```

---

### Task 10: Update Module Imports

**Files:**
- Modify: `apps/mist/src/app.module.ts`
- Modify: `apps/mcp-server/src/mcp-server.module.ts`
- Modify: `apps/schedule/src/schedule.module.ts`

- [ ] **Step 1: Update app.module.ts**

Edit `apps/mist/src/app.module.ts`:

Change imports:
```typescript
import {
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionMqmt,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
```

Update TypeOrmModule entities array:
```typescript
          entities: [
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionMqmt,
            Security,
            SecuritySourceConfig,
          ],
```

- [ ] **Step 2: Update mcp-server.module.ts**

Edit `apps/mcp-server/src/mcp-server.module.ts`:

Change imports and update all `MarketDataBar` to `K`

- [ ] **Step 3: Update schedule.module.ts**

Edit `apps/schedule/src/schedule.module.ts`:

Change imports and update all `MarketDataBar` to `K`

- [ ] **Step 4: Verify compilation**

```bash
pnpm run build
```

Expected: No compilation errors (ignoring market-data module which we'll update next)

- [ ] **Step 5: Commit module updates**

```bash
git add apps/mist/src/app.module.ts apps/mcp-server/ apps/schedule/
git commit -m "refactor: update module imports to use K entities"
```

---

### Task 11: Update MCP Server and Schedule Services

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`
- Modify: `apps/mcp-server/src/services/data-mcp.service.spec.ts`
- Modify: Any schedule service files

- [ ] **Step 1: Update data-mcp.service.ts**

Edit `apps/mcp-server/src/services/data-mcp.service.ts`:

Change imports:
```typescript
import { Security, K, KPeriod } from '@app/shared-data';
```

Update all references from `MarketDataBar` to `K` and `BarPeriod` to `KPeriod`

- [ ] **Step 2: Update data-mcp.service.spec.ts**

Edit `apps/mcp-server/src/services/data-mcp.service.spec.ts`:

Change imports and update all mock objects to use `K` instead of `MarketDataBar`

- [ ] **Step 3: Run MCP server tests**

```bash
pnpm test -- apps/mcp-server/
```

Expected: All tests pass

- [ ] **Step 4: Commit MCP server updates**

```bash
git add apps/mcp-server/
git commit -m "refactor: update MCP server to use K entity"
```

---

## Phase 3: Market-Data Module Rename

### Task 12: Rename Market-Data Directory and Files

**Files:**
- Rename directory: `apps/mist/src/market-data/` → `apps/mist/src/k/`
- Rename: `apps/mist/src/k/market-data.module.ts` → `apps/mist/src/k/k.module.ts`
- Rename: `apps/mist/src/k/market-data.service.ts` → `apps/mist/src/k/k.service.ts`
- Rename: `apps/mist/src/k/market-data.controller.ts` → `apps/mist/src/k/k.controller.ts`
- Rename: `apps/mist/src/k/dto/query-bars.dto.ts` → `apps/mist/src/k/dto/query-ks.dto.ts`
- Rename: `apps/mist/src/k/vo/bars.vo.ts` → `apps/mist/src/k/vo/ks.vo.ts`
- Modify: All renamed files

- [ ] **Step 1: Rename directory**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src
mv market-data k
```

Expected: Directory renamed successfully

- [ ] **Step 2: Rename module file**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src/k
mv market-data.module.ts k.module.ts
```

- [ ] **Step 3: Rename service file**

```bash
mv market-data.service.ts k.service.ts
```

- [ ] **Step 4: Rename controller file**

```bash
mv market-data.controller.ts k.controller.ts
```

- [ ] **Step 5: Rename DTO file**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src/k/dto
mv query-bars.dto.ts query-ks.dto.ts
```

- [ ] **Step 6: Rename VO file**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist/src/k/vo
mv bars.vo.ts ks.vo.ts
```

- [ ] **Step 7: Update k.module.ts**

Edit `apps/mist/src/k/k.module.ts`:

Change:
```typescript
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { MarketDataBar, Security } from '@app/shared-data';

@Module({
  imports: [TypeOrmModule.forFeature([MarketDataBar, Security])],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
```

To:
```typescript
import { KController } from './k.controller';
import { KService } from './k.service';
import { K, Security } from '@app/shared-data';

@Module({
  imports: [TypeOrmModule.forFeature([K, Security])],
  controllers: [KController],
  providers: [KService],
  exports: [KService],
})
export class KModule {}
```

- [ ] **Step 8: Update k.service.ts**

Edit `apps/mist/src/k/k.service.ts`:

Change:
```typescript
import { MarketDataBar, Security } from '@app/shared-data';

@Injectable()
export class MarketDataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private marketDataBarRepository: Repository<MarketDataBar>,
  ) {}

  async findBarsById(queryDto: any): Promise<MarketDataBar[]> {
```

To:
```typescript
import { K, Security } from '@app/shared-data';

@Injectable()
export class KService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
  ) {}

  async findBarsById(queryDto: any): Promise<K[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: queryDto.symbol,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.kRepository.find({
```

- [ ] **Step 9: Update k.controller.ts**

Edit `apps/mist/src/k/k.controller.ts`:

Change:
```typescript
import { QueryBarsDto } from './dto/query-bars.dto';
import { MarketDataService } from './market-data.service';
import { BarsVo } from './vo/bars.vo';

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}
```

To:
```typescript
import { QueryKsDto } from './dto/query-ks.dto';
import { KService } from './k.service';
import { KsVo } from './vo/ks.vo';

@ApiTags('market-data')
@Controller('market-data')
export class KController {
  constructor(private readonly kService: KService) {}
```

Update the method:
```typescript
  async queryBars(@Body() queryKsDto: QueryKsDto): Promise<KsVo[]> {
    const bars = await this.kService.findBarsById(queryKsDto);
```

- [ ] **Step 10: Update query-ks.dto.ts**

Edit `apps/mist/src/k/dto/query-ks.dto.ts`:

Change:
```typescript
import { IsEnum, IsNotEmpty, IsDateString } from 'class-validator';
import { BarPeriod } from '@app/shared-data';

export class QueryBarsDto {
```

To:
```typescript
import { IsEnum, IsNotEmpty, IsDateString } from 'class-validator';
import { KPeriod } from '@app/shared-data';

export class QueryKsDto {
```

And update the decorator:
```typescript
  @IsEnum(KPeriod)
  period: KPeriod;
```

- [ ] **Step 11: Update ks.vo.ts**

Edit `apps/mist/src/k/vo/ks.vo.ts`:

Change:
```typescript
export class BarsVo {
```

To:
```typescript
export class KsVo {
```

- [ ] **Step 12: Update app.module.ts import**

Edit `apps/mist/src/app.module.ts`:

Change:
```typescript
import { MarketDataModule } from './market-data/market-data.module';
```

To:
```typescript
import { KModule } from './k/k.module';
```

And update imports array:
```typescript
    MarketDataModule,
```

To:
```typescript
    KModule,
```

- [ ] **Step 13: Verify compilation**

```bash
pnpm run build
```

Expected: No compilation errors

- [ ] **Step 14: Commit module rename**

```bash
git add apps/mist/src/
git commit -m "refactor: rename market-data module to k"
```

---

## Phase 4: Shared DTO/VO Rename

### Task 13: Rename Shared DTO and VO Files

**Files:**
- Rename: `libs/shared-data/src/vo/bars.vo.ts` → `libs/shared-data/src/vo/ks.vo.ts`
- Rename: `libs/shared-data/src/vo/market-data-bar.vo.ts` → `libs/shared-data/src/vo/k.vo.ts`
- Rename: `libs/shared-data/src/dto/save-market-data.dto.ts` → `libs/shared-data/src/dto/save-k.dto.ts`
- Rename: `libs/shared-data/src/dto/query-market-data.dto.ts` → `libs/shared-data/src/dto/query-k.dto.ts`
- Rename: `libs/shared-data/src/dto/query-bars.dto.ts` → `libs/shared-data/src/dto/query-ks.dto.ts`
- Modify: `libs/shared-data/src/index.ts`

- [ ] **Step 1: Rename VO files**

```bash
cd /Users/xiyugao/code/mist/mist/libs/shared-data/src/vo
mv bars.vo.ts ks.vo.ts
mv market-data-bar.vo.ts k.vo.ts
```

- [ ] **Step 2: Rename DTO files**

```bash
cd /Users/xiyugao/code/mist/mist/libs/shared-data/src/dto
mv save-market-data.dto.ts save-k.dto.ts
mv query-market-data.dto.ts query-k.dto.ts
mv query-bars.dto.ts query-ks.dto.ts
```

- [ ] **Step 3: Update ks.vo.ts**

Edit `libs/shared-data/src/vo/ks.vo.ts`:

Change:
```typescript
export class BarsVo {
```

To:
```typescript
export class KsVo {
```

- [ ] **Step 4: Update k.vo.ts**

Edit `libs/shared-data/src/vo/k.vo.ts`:

Change:
```typescript
export class MarketDataBarVo {
```

To:
```typescript
export class KVo {
```

- [ ] **Step 5: Update save-k.dto.ts**

Edit `libs/shared-data/src/dto/save-k.dto.ts`:

Change class name from `SaveMarketDataDto` to `SaveKDto`

- [ ] **Step 6: Update query-k.dto.ts**

Edit `libs/shared-data/src/dto/query-k.dto.ts`:

Change class name from `QueryMarketDataDto` to `QueryKDto`

- [ ] **Step 7: Update query-ks.dto.ts**

Edit `libs/shared-data/src/dto/query-ks.dto.ts`:

Change class name from `QueryBarsDto` to `QueryKsDto`

- [ ] **Step 8: Update exports in index.ts**

Edit `libs/shared-data/src/index.ts`:

Update VO/DTO exports:
```typescript
export * from './vo/ks.vo';
export * from './vo/k.vo';
export * from './dto/save-k.dto';
export * from './dto/query-k.dto';
export * from './dto/query-ks.dto';
```

- [ ] **Step 9: Verify compilation**

```bash
pnpm run build
```

Expected: No compilation errors

- [ ] **Step 10: Commit DTO/VO renames**

```bash
git add libs/shared-data/src/vo/ libs/shared-data/src/dto/
git commit -m "refactor: rename shared DTOs and VOs to K*"
```

---

## Phase 5: Test Updates

### Task 14: Update All Test Files

**Files:**
- Modify: `libs/shared-data/src/shared-data.service.spec.ts`
- Modify: `apps/mist/src/data-collector/data-collector.service.spec.ts`
- Modify: `apps/mist/src/stock/stock.service.spec.ts`
- Modify: `apps/mist/src/stock/stock.controller.spec.ts`
- Modify: Any other test files with MarketDataBar or BarPeriod references

- [ ] **Step 1: Update shared-data.service.spec.ts**

Edit `libs/shared-data/src/shared-data.service.spec.ts`:

Change imports:
```typescript
import { Security, K } from '@app/shared-data';
```

Update repository tokens and mocks:
```typescript
        {
          provide: getRepositoryToken(K),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
```

- [ ] **Step 2: Update data-collector.service.spec.ts**

Edit `apps/mist/src/data-collector/data-collector.service.spec.ts`:

Change imports and update all `MarketDataBar` to `K`

- [ ] **Step 3: Update stock test files**

Edit `apps/mist/src/stock/stock.service.spec.ts` and `stock.controller.spec.ts`:

Update any references if needed (these may not use MarketDataBar directly)

- [ ] **Step 4: Search for remaining test files**

```bash
cd /Users/xiyugao/code/mist/mist
grep -r "MarketDataBar\|BarPeriod" --include="*.spec.ts" apps/ libs/
```

Update any files found

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass (or skip database-dependent tests)

- [ ] **Step 6: Commit test updates**

```bash
git add .
git commit -m "refactor: update all test files to use K and KPeriod"
```

---

## Phase 6: Final Verification

### Task 15: Verify All References Updated

- [ ] **Step 1: Search for remaining MarketDataBar references**

```bash
cd /Users/xiyugao/code/mist/mist
grep -r "MarketDataBar" --include="*.ts" apps/ libs/ | grep -v "node_modules"
```

Expected: No results (except in git history or comments)

- [ ] **Step 2: Search for remaining BarPeriod references**

```bash
grep -r "BarPeriod" --include="*.ts" apps/ libs/ | grep -v "node_modules"
```

Expected: No results (except in git history or comments)

- [ ] **Step 3: Search for remaining MarketDataModule references**

```bash
grep -r "MarketDataModule\|MarketDataService\|MarketDataController" --include="*.ts" apps/ | grep -v "node_modules"
```

Expected: No results

- [ ] **Step 4: Verify compilation**

```bash
pnpm run build
```

Expected: Clean build with no errors

- [ ] **Step 5: Run linter**

```bash
pnpm run lint
```

Expected: No lint errors (or auto-fixable warnings)

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add .
git commit -m "refactor: fix remaining references and lint issues"
```

---

## Phase 7: Database Migration

### Task 16: Verify Database Constraints

- [ ] **Step 1: Connect to MySQL**

```bash
mysql -u root -p mist
```

- [ ] **Step 2: Query current foreign key constraints**

```sql
SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE TABLE_SCHEMA = 'mist'
AND (TABLE_NAME LIKE 'market_data%' OR TABLE_NAME LIKE 'k_extension%');
```

Expected: Shows current constraint names for market_data tables

**Note down the constraint names** - you'll need them for the migration

- [ ] **Step 3: Exit MySQL**

```sql
exit;
```

---

### Task 17: Create Database Migration File

- [ ] **Step 1: Generate new migration**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run migration:generate -- -n RenameMarketDataBarToK
```

Expected: New migration file created in `apps/mist/src/migrations/`

- [ ] **Step 2: Edit migration file**

Find the generated migration file (most recent in `apps/mist/src/migrations/`)

Edit it with the actual SQL (replace constraint names with those from Step 14):

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMarketDataBarToK1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename main table
    await queryRunner.query(`RENAME TABLE market_data_bars TO ks`);

    // Rename extension tables
    await queryRunner.query(`RENAME TABLE market_data_extensions_ef TO k_extensions_ef`);
    await queryRunner.query(`RENAME TABLE market_data_extensions_tdx TO k_extensions_tdx`);
    await queryRunner.query(`RENAME TABLE market_data_extensions_mqmt TO k_extensions_mqmt`);

    // Drop old foreign key constraints (use actual constraint names from Step 14)
    await queryRunner.query(`ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_market_data_extensions_ef_bar_id`);
    await queryRunner.query(`ALTER TABLE k_extensions_tdx DROP FOREIGN KEY fk_market_data_extensions_tdx_bar_id`);
    await queryRunner.query(`ALTER TABLE k_extensions_mqmt DROP FOREIGN KEY fk_market_data_extensions_mqmt_bar_id`);

    // Add new foreign key constraints
    await queryRunner.query(`ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_k_extensions_ef_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE k_extensions_tdx ADD CONSTRAINT fk_k_extensions_tdx_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE k_extensions_mqmt ADD CONSTRAINT fk_k_extensions_mqmt_bar_id FOREIGN KEY (bar_id) REFERENCES ks(id) ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the changes
    await queryRunner.query(`ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_k_extensions_ef_bar_id`);
    await queryRunner.query(`ALTER TABLE k_extensions_tdx DROP FOREIGN KEY fk_k_extensions_tdx_bar_id`);
    await queryRunner.query(`ALTER TABLE k_extensions_mqmt DROP FOREIGN KEY fk_k_extensions_mqmt_bar_id`);

    await queryRunner.query(`ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_market_data_extensions_ef_bar_id FOREIGN KEY (bar_id) REFERENCES market_data_bars(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE k_extensions_tdx ADD CONSTRAINT fk_market_data_extensions_tdx_bar_id FOREIGN KEY (bar_id) REFERENCES market_data_bars(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE k_extensions_mqmt ADD CONSTRAINT fk_market_data_extensions_mqmt_bar_id FOREIGN KEY (bar_id) REFERENCES market_data_bars(id) ON DELETE CASCADE`);

    await queryRunner.query(`RENAME TABLE k_extensions_ef TO market_data_extensions_ef`);
    await queryRunner.query(`RENAME TABLE k_extensions_tdx TO market_data_extensions_tdx`);
    await queryRunner.query(`RENAME TABLE k_extensions_mqmt TO market_data_extensions_mqmt`);
    await queryRunner.query(`RENAME TABLE ks TO market_data_bars`);
  }
}
```

**Important:** Replace constraint names with actual names from your database

- [ ] **Step 3: Review migration file**

Ensure all table names and constraint names match your database schema

- [ ] **Step 4: Commit migration file**

```bash
git add apps/mist/src/migrations/
git commit -m "feat: add migration to rename MarketDataBar to K tables"
```

---

### Task 18: Backup and Run Migration

- [ ] **Step 1: Backup database (optional but recommended)**

```bash
mysqldump -u root -p mist > mist_backup_$(date +%Y%m%d_%H%M%S).sql
```

Expected: Backup file created

- [ ] **Step 2: Run migration**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run migration:run
```

Expected: Migration executes successfully

- [ ] **Step 3: Verify tables renamed**

```bash
mysql -u root -p mist -e "SHOW TABLES LIKE '%k%';"
```

Expected: Shows `ks`, `k_extensions_ef`, `k_extensions_tdx`, `k_extensions_mqmt`

- [ ] **Step 4: Verify foreign keys**

```sql
mysql -u root -p mist
```

```sql
SELECT
    CONSTRAINT_NAME,
    TABLE_NAME,
    REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE TABLE_SCHEMA = 'mist'
AND TABLE_NAME LIKE 'k_extension%';
```

Expected: Shows foreign keys pointing to `ks` table

- [ ] **Step 5: Exit MySQL**

```sql
exit;
```

---

### Task 19: Post-Migration Testing

- [ ] **Step 1: Start application**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run start:dev:mist
```

Expected: Application starts without database errors

- [ ] **Step 2: Test API endpoint**

```bash
curl -X POST http://localhost:8001/market-data/bars \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "1min",
    "startDate": "2024-01-01",
    "endDate": "2024-01-02"
  }'
```

Expected: API returns data successfully

- [ ] **Step 3: Verify data integrity**

```bash
mysql -u root -p mist -e "SELECT COUNT(*) as total FROM ks;"
```

Expected: Returns row count (should match previous `market_data_bars` count)

- [ ] **Step 4: Run integration tests**

```bash
pnpm run test:e2e
```

Expected: All e2e tests pass

- [ ] **Step 5: Commit post-migration fixes**

```bash
git add .
git commit -m "test: verify database migration and integration"
```

---

## Phase 8: Final Validation

### Task 20: Complete Validation Checklist

- [ ] **Step 1: Verify all tests pass**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Verify build succeeds**

```bash
pnpm run build
```

Expected: Clean build

- [ ] **Step 3: Verify API routes unchanged**

Test that `/market-data/bars` still works (backward compatibility)

- [ ] **Step 4: Verify foreign key relationships**

Test that extension tables still cascade delete correctly

- [ ] **Step 5: Check for any remaining old references**

```bash
grep -r "market.data.bar\|MarketDataBar\|BarPeriod" --include="*.ts" apps/ libs/ | grep -v node_modules | grep -v ".git"
```

Expected: No results in production code

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "refactor: complete MarketDataBar to K rename

- Renamed BarPeriod enum to KPeriod
- Renamed MarketDataBar entity to K
- Renamed all extension entities to KExtension*
- Renamed market-data module to k module
- Updated all references across codebase
- Created and ran database migration
- All tests passing
- API routes unchanged for backward compatibility"
```

---

## Rollback Procedures

### If Code Changes Fail

Before running migration, you can rollback code changes:

```bash
# Reset to before refactor
git reset --hard <commit-hash-before-refactor>

# Or revert specific commits
git revert <range-of-commits>
```

### If Migration Fails

**Option 1: Use migration down method**

```bash
pnpm run migration:revert
```

**Option 2: Manual SQL rollback**

Connect to MySQL and run:

```sql
-- Reverse foreign key changes
ALTER TABLE k_extensions_ef DROP FOREIGN KEY fk_k_extensions_ef_bar_id;
ALTER TABLE k_extensions_ef ADD CONSTRAINT fk_market_data_extensions_ef_bar_id
  FOREIGN KEY (bar_id) REFERENCES market_data_bars(id) ON DELETE CASCADE;

-- Repeat for other extension tables

-- Rename tables back
RENAME TABLE ks TO market_data_bars;
RENAME TABLE k_extensions_ef TO market_data_extensions_ef;
RENAME TABLE k_extensions_tdx TO market_data_extensions_tdx;
RENAME TABLE k_extensions_mqmt TO market_data_extensions_mqmt;
```

**Option 3: Restore from backup**

```bash
mysql -u root -p mist < mist_backup_<timestamp>.sql
```

---

## Success Criteria

✅ All code compiles without errors
✅ All unit tests pass
✅ All integration tests pass
✅ Database migration runs successfully
✅ Foreign key relationships work correctly
✅ API routes remain functional (backward compatibility)
✅ No remaining references to old names
✅ Data integrity maintained

---

## Notes

- This refactoring maintains API backward compatibility by keeping routes unchanged
- Security entity's @OneToMany relationship to MarketDataBar is updated to reference K
- Database field names remain unchanged
- Only entity names, file names, and table names change
- All business logic remains the same
