# Multi-Data Source K-Line Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-data source K-line data structure that supports East Money, TDX, and miniQMT with unified storage and query capabilities.

**Architecture:** Pure stock code as identifier, data source format mapping table, unified K-line main table with source-specific extension tables, simple period mapping with direct error handling.

**Tech Stack:** NestJS, TypeORM, MySQL, TypeScript

---

## File Structure

```
libs/shared-data/src/
├── enums/
│   ├── data-source.enum.ts           # 数据源枚举
│   ├── stock-status.enum.ts          # 股票状态枚举
│   └── kline-period.enum.ts          # K线周期枚举
├── utils/
│   └── period-mapping.util.ts        # 周期映射工具
├── entities/
│   ├── stock.entity.ts               # 股票主表实体
│   ├── stock-source-format.entity.ts # 数据源格式映射实体
│   ├── kline.entity.ts               # K线主表实体
│   ├── kline-extension-ef.entity.ts  # 东方财富扩展实体
│   ├── kline-extension-tdx.entity.ts # 通达信扩展实体
│   └── kline-extension-mqmt.entity.ts # miniQMT扩展实体
├── dto/
│   └── kline-query.dto.ts            # K线查询DTO
├── vo/
│   └── kline.vo.ts                   # K线返回VO
└── index.ts                          # 导出新实体

apps/mist/src/
├── stock/
│   ├── stock.controller.ts           # 股票管理控制器
│   ├── stock.service.ts              # 股票管理服务
│   ├── stock.module.ts               # 股票管理模块
│   └── dto/
│       ├── init-stock.dto.ts         # 初始化股票DTO
│       └── add-source.dto.ts         # 添加数据源DTO
├── data-collector/
│   ├── data-collector.service.ts     # 数据采集服务
│   ├── data-collector.module.ts      # 数据采集模块
│   └── interfaces/
│       └── source-fetcher.interface.ts # 数据源采集接口
└── sources/
    ├── east-money.source.ts          # 东方财富数据源
    ├── tdx.source.ts                 # 通达信数据源
    └── mqmt.source.ts                # miniQMT数据源

migrations/
└── YYYY-MM-DD-multi-data-source-kline.ts # 数据库迁移
```

---

## Task 1: Create Enumerations

**Files:**
- Create: `libs/shared-data/src/enums/data-source.enum.ts`
- Create: `libs/shared-data/src/enums/stock-status.enum.ts`
- Create: `libs/shared-data/src/enums/kline-period.enum.ts`
- Test: `libs/shared-data/src/enums/data-source.enum.spec.ts`

- [ ] **Step 1: Create data source enum**

```typescript
// libs/shared-data/src/enums/data-source.enum.ts
export enum DataSource {
  EAST_MONEY = 'ef',        // 东方财富
  TDX = 'tdx',              // 通达信
  MINI_QMT = 'mqmt',        // miniQMT
}
```

- [ ] **Step 2: Create stock status enum**

```typescript
// libs/shared-data/src/enums/stock-status.enum.ts
export enum StockStatus {
  NORMAL = 1,               // 正常
  SUSPENDED = 0,            // 停牌
  DELISTED = -1,            // 退市
}
```

- [ ] **Step 3: Create K-line period enum**

```typescript
// libs/shared-data/src/enums/kline-period.enum.ts
export enum KLinePeriod {
  ONE_MIN = '1min',
  FIVE_MIN = '5min',
  FIFTEEN_MIN = '15min',
  THIRTY_MIN = '30min',
  SIXTY_MIN = '60min',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}
```

- [ ] **Step 4: Write test for data source enum**

```typescript
// libs/shared-data/src/enums/data-source.enum.spec.ts
import { DataSource } from './data-source.enum';

describe('DataSource', () => {
  it('should have correct values', () => {
    expect(DataSource.EAST_MONEY).toBe('ef');
    expect(DataSource.TDX).toBe('tdx');
    expect(DataSource.MINI_QMT).toBe('mqmt');
  });

  it('should have three sources', () => {
    const values = Object.values(DataSource);
    expect(values).toHaveLength(3);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- data-source.enum.spec.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data/src/enums/
git commit -m "feat: add data source, stock status, and kline period enums"
```

---

## Task 2: Create Period Mapping Utility

**Files:**
- Create: `libs/shared-data/src/utils/period-mapping.util.ts`
- Test: `libs/shared-data/src/utils/period-mapping.util.spec.ts`

- [ ] **Step 1: Write failing test for period mapping**

```typescript
// libs/shared-data/src/utils/period-mapping.util.spec.ts
import { PeriodMapping } from './period-mapping.util';
import { KLinePeriod } from '../enums/kline-period.enum';
import { DataSource } from '../enums/data-source.enum';

describe('PeriodMapping', () => {
  describe('toSourceFormat', () => {
    it('should convert 1min to east money format', () => {
      const result = PeriodMapping.toSourceFormat(KLinePeriod.ONE_MIN, DataSource.EAST_MONEY);
      expect(result).toBe('1');
    });

    it('should convert daily to east money format', () => {
      const result = PeriodMapping.toSourceFormat(KLinePeriod.DAILY, DataSource.EAST_MONEY);
      expect(result).toBe('daily');
    });

    it('should convert 1min to tdx format', () => {
      const result = PeriodMapping.toSourceFormat(KLinePeriod.ONE_MIN, DataSource.TDX);
      expect(result).toBe('1m');
    });

    it('should throw error for unsupported period', () => {
      expect(() => {
        PeriodMapping.toSourceFormat(KLinePeriod.FIFTEEN_MIN, DataSource.TDX);
      }).toThrow('数据源 tdx 不支持周期 15min');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported periods', () => {
      expect(PeriodMapping.isSupported(KLinePeriod.DAILY, DataSource.EAST_MONEY)).toBe(true);
      expect(PeriodMapping.isSupported(KLinePeriod.DAILY, DataSource.TDX)).toBe(true);
    });

    it('should return false for unsupported periods', () => {
      expect(PeriodMapping.isSupported(KLinePeriod.FIFTEEN_MIN, DataSource.TDX)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- period-mapping.util.spec.ts`

Expected: FAIL with "PeriodMapping is not defined"

- [ ] **Step 3: Implement PeriodMapping utility**

```typescript
// libs/shared-data/src/utils/period-mapping.util.ts
import { KLinePeriod } from '../enums/kline-period.enum';
import { DataSource } from '../enums/data-source.enum';

const PERIOD_MAPPING: Record<DataSource, Partial<Record<KLinePeriod, string>>> = {
  [DataSource.EAST_MONEY]: {
    [KLinePeriod.ONE_MIN]: '1',
    [KLinePeriod.FIVE_MIN]: '5',
    [KLinePeriod.FIFTEEN_MIN]: '15',
    [KLinePeriod.THIRTY_MIN]: '30',
    [KLinePeriod.SIXTY_MIN]: '60',
    [KLinePeriod.DAILY]: 'daily',
    [KLinePeriod.WEEKLY]: 'weekly',
    [KLinePeriod.MONTHLY]: 'monthly',
  },
  [DataSource.TDX]: {
    [KLinePeriod.ONE_MIN]: '1m',
    [KLinePeriod.FIVE_MIN]: '5m',
    [KLinePeriod.DAILY]: '1d',
  },
  [DataSource.MINI_QMT]: {},
};

export class PeriodMapping {
  static toSourceFormat(period: KLinePeriod, source: DataSource): string {
    const mapping = PERIOD_MAPPING[source];
    if (!mapping || !mapping[period]) {
      throw new Error(`数据源 ${source} 不支持周期 ${period}`);
    }
    return mapping[period];
  }

  static isSupported(period: KLinePeriod, source: DataSource): boolean {
    const mapping = PERIOD_MAPPING[source];
    return !!(mapping && mapping[period]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- period-mapping.util.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/utils/
git commit -m "feat: add period mapping utility for data source format conversion"
```

---

## Task 3: Create Stock Entity

**Files:**
- Create: `libs/shared-data/src/entities/stock.entity.ts`
- Test: `libs/shared-data/src/entities/stock.entity.spec.ts`

- [ ] **Step 1: Write failing test for stock entity**

```typescript
// libs/shared-data/src/entities/stock.entity.spec.ts
import { Stock } from './stock.entity';
import { StockStatus } from '../enums/stock-status.enum';

describe('Stock', () => {
  it('should create stock entity with required properties', () => {
    const stock = new Stock();
    stock.code = '000001';
    stock.name = '测试股票';
    stock.status = StockStatus.NORMAL;

    expect(stock.code).toBe('000001');
    expect(stock.name).toBe('测试股票');
    expect(stock.status).toBe(StockStatus.NORMAL);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock.entity.spec.ts`

Expected: FAIL with "Stock is not defined"

- [ ] **Step 3: Implement stock entity**

```typescript
// libs/shared-data/src/entities/stock.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockStatus } from '../enums/stock-status.enum';
import { StockSourceFormat } from './stock-source-format.entity';
import { KLine } from './kline.entity';

@Entity({
  name: 'stocks',
})
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: '纯股票代码，如 000001, 600000',
  })
  code: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '股票名称',
  })
  name: string;

  @Column({
    type: 'tinyint',
    default: StockStatus.NORMAL,
    comment: '状态：1=正常 0=停牌 -1=退市',
  })
  status: StockStatus;

  @OneToMany(() => StockSourceFormat, (format) => format.stock)
  sourceFormats: StockSourceFormat[];

  @OneToMany(() => KLine, (kline) => kline.stock)
  klines: KLine[];

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock.entity.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/entities/stock.entity.ts
git commit -m "feat: add stock entity"
```

---

## Task 4: Create StockSourceFormat Entity

**Files:**
- Create: `libs/shared-data/src/entities/stock-source-format.entity.ts`
- Test: `libs/shared-data/src/entities/stock-source-format.entity.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// libs/shared-data/src/entities/stock-source-format.entity.spec.ts
import { StockSourceFormat } from './stock-source-format.entity';
import { DataSource } from '../enums/data-source.enum';

describe('StockSourceFormat', () => {
  it('should create format with required properties', () => {
    const format = new StockSourceFormat();
    format.source = DataSource.EAST_MONEY;
    format.formattedCode = 'sz000001';

    expect(format.source).toBe(DataSource.EAST_MONEY);
    expect(format.formattedCode).toBe('sz000001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock-source-format.entity.spec.ts`

Expected: FAIL

- [ ] **Step 3: Implement entity**

```typescript
// libs/shared-data/src/entities/stock-source-format.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Stock } from './stock.entity';

@Entity({
  name: 'stock_source_formats',
})
@Unique(['stock', 'source'])
export class StockSourceFormat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '数据源标识：ef/tdx/mqmt',
  })
  source: DataSource;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '该数据源的完整格式代码，如 sz000001, 000001.SH',
  })
  formattedCode: string;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock-source-format.entity.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/entities/stock-source-format.entity.ts
git commit -m "feat: add stock source format entity"
```

---

## Task 5: Create KLine Entity

**Files:**
- Create: `libs/shared-data/src/entities/kline.entity.ts`
- Test: `libs/shared-data/src/entities/kline.entity.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// libs/shared-data/src/entities/kline.entity.spec.ts
import { KLine } from './kline.entity';
import { KLinePeriod } from '../enums/kline-period.enum';
import { DataSource } from '../enums/data-source.enum';

describe('KLine', () => {
  it('should create kline with required properties', () => {
    const kline = new KLine();
    kline.source = DataSource.EAST_MONEY;
    kline.period = KLinePeriod.DAILY;
    kline.timestamp = new Date();
    kline.open = 10;
    kline.high = 11;
    kline.low = 9.5;
    kline.close = 10.5;
    kline.volume = '1000000';
    kline.amount = 10500000;

    expect(kline.source).toBe(DataSource.EAST_MONEY);
    expect(kline.period).toBe(KLinePeriod.DAILY);
    expect(kline.open).toBe(10);
    expect(kline.close).toBe(10.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- kline.entity.spec.ts`

Expected: FAIL

- [ ] **Step 3: Implement entity**

```typescript
// libs/shared-data/src/entities/kline.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { KLinePeriod } from '../enums/kline-period.enum';
import { Stock } from './stock.entity';

@Entity({
  name: 'k_lines',
})
@Index(['stock', 'source', 'period', 'timestamp'])
export class KLine {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '数据源：ef/tdx/mqmt',
  })
  source: DataSource;

  @Column({
    type: 'enum',
    enum: KLinePeriod,
    comment: '周期：1min/5min/15min/30min/60min/daily/weekly/monthly',
  })
  period: KLinePeriod;

  @Column({
    type: 'datetime',
    comment: '时间戳',
  })
  timestamp: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '开盘价',
  })
  open: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最高价',
  })
  high: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最低价',
  })
  low: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '收盘价',
  })
  close: number;

  @Column({
    type: 'bigint',
    comment: '成交量（手）',
  })
  volume: string;

  @Column({
    type: 'double',
    comment: '成交额（元）',
  })
  amount: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- kline.entity.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data/src/entities/kline.entity.ts
git commit -m "feat: add kline entity with multi-source support"
```

---

## Task 6: Create KLine Extension Entities

**Files:**
- Create: `libs/shared-data/src/entities/kline-extension-ef.entity.ts`
- Create: `libs/shared-data/src/entities/kline-extension-tdx.entity.ts`
- Create: `libs/shared-data/src/entities/kline-extension-mqmt.entity.ts`
- Test: `libs/shared-data/src/entities/kline-extension-ef.entity.spec.ts`

- [ ] **Step 1: Write failing test for East Money extension**

```typescript
// libs/shared-data/src/entities/kline-extension-ef.entity.spec.ts
import { KLineExtensionEf } from './kline-extension-ef.entity';

describe('KLineExtensionEf', () => {
  it('should create extension with all fields', () => {
    const ext = new KLineExtensionEf();
    ext.amplitude = 2.5;
    ext.changePct = 1.2;
    ext.changeAmt = 0.12;
    ext.turnoverRate = 3.5;

    expect(ext.amplitude).toBe(2.5);
    expect(ext.changePct).toBe(1.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- kline-extension-ef.entity.spec.ts`

Expected: FAIL

- [ ] **Step 3: Implement East Money extension entity**

```typescript
// libs/shared-data/src/entities/kline-extension-ef.entity.ts
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KLine } from './kline.entity';

@Entity({
  name: 'k_line_extensions_ef',
})
export class KLineExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '振幅（%）',
  })
  amplitude: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌幅（%）',
  })
  changePct: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌额（元）',
  })
  changeAmt: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number;
}
```

- [ ] **Step 4: Implement TDX extension entity**

```typescript
// libs/shared-data/src/entities/kline-extension-tdx.entity.ts
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KLine } from './kline.entity';

@Entity({
  name: 'k_line_extensions_tdx',
})
export class KLineExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
    comment: '前复权因子',
  })
  forwardFactor: number;
}
```

- [ ] **Step 5: Implement miniQMT extension entity (placeholder)**

```typescript
// libs/shared-data/src/entities/kline-extension-mqmt.entity.ts
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KLine } from './kline.entity';

@Entity({
  name: 'k_line_extensions_mqmt',
})
export class KLineExtensionMqmt {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  // TODO: 待补充 miniQMT 特有字段
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- kline-extension-ef.entity.spec.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add libs/shared-data/src/entities/kline-extension-*.entity.ts
git commit -m "feat: add kline extension entities for data sources"
```

---

## Task 7: Update Shared Data Exports

**Files:**
- Modify: `libs/shared-data/src/entities/index.ts`

- [ ] **Step 1: Export new entities**

```typescript
// libs/shared-data/src/entities/index.ts
export * from './stock.entity';
export * from './stock-source-format.entity';
export * from './kline.entity';
export * from './kline-extension-ef.entity';
export * from './kline-extension-tdx.entity';
export * from './kline-extension-mqmt.entity';
export * from './index-data.entitiy';
export * from './index-daily.entity';
export * from './index-period.entity';
```

- [ ] **Step 2: Update main shared-data index**

```typescript
// libs/shared-data/src/index.ts
export * from './enums/data-source.enum';
export * from './enums/stock-status.enum';
export * from './enums/kline-period.enum';
export * from './utils/period-mapping.util';
export * from './entities';
// ... existing exports
```

- [ ] **Step 3: Verify exports work**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm tsc --noEmit`

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data/src/index.ts libs/shared-data/src/entities/index.ts
git commit -m "chore: export new entities and enums"
```

---

## Task 8: Create Database Migration

**Files:**
- Create: `migrations/YYYY-MM-DD-multi-data-source-kline.ts`

- [ ] **Step 1: Generate migration**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run migration:generate -- -n MultiDataSourceKline`

Expected: Migration file generated

- [ ] **Step 2: Review migration file**

Check that the migration includes:
- `stocks` table
- `stock_source_formats` table
- `k_lines` table
- `k_line_extensions_ef` table
- `k_line_extensions_tdx` table
- `k_line_extensions_mqmt` table
- All indexes and foreign keys

- [ ] **Step 3: Run migration**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run migration:run`

Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add migrations/
git commit -m "chore: add database migration for multi-data source kline tables"
```

---

## Task 9: Create Stock Service

**Files:**
- Create: `apps/mist/src/stock/dto/init-stock.dto.ts`
- Create: `apps/mist/src/stock/dto/add-source.dto.ts`
- Create: `apps/mist/src/stock/stock.service.ts`
- Create: `apps/mist/src/stock/stock.module.ts`
- Test: `apps/mist/src/stock/stock.service.spec.ts`

- [ ] **Step 1: Create DTOs**

```typescript
// apps/mist/src/stock/dto/init-stock.dto.ts
import { IsArray, IsString, IsEnum } from 'class-validator';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

export class InitStockDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsArray()
  @IsEnum(DataSource, { each: true })
  sources: DataSource[];
}

// apps/mist/src/stock/dto/add-source.dto.ts
import { IsString, IsEnum } from 'class-validator';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

export class AddSourceDto {
  @IsString()
  code: string;

  @IsEnum(DataSource)
  source: DataSource;
}
```

- [ ] **Step 2: Write failing test for stock service**

```typescript
// apps/mist/src/stock/stock.service.spec.ts
import { Test } from '@nestjs/testing';
import { StockService } from './stock.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Stock } from '@app/shared-data/entities/stock.entity';
import { StockSourceFormat } from '@app/shared-data/entities/stock-source-format.entity';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

describe('StockService', () => {
  let service: StockService;

  const mockStockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFormatRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: getRepositoryToken(Stock),
          useValue: mockStockRepo,
        },
        {
          provide: getRepositoryToken(StockSourceFormat),
          useValue: mockFormatRepo,
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initStock', () => {
    it('should create new stock with source formats', async () => {
      mockStockRepo.findOne.mockResolvedValue(null);
      mockStockRepo.create.mockReturnValue({ id: 1 });
      mockStockRepo.save.mockResolvedValue({ id: 1, code: '000001' });
      mockFormatRepo.findOne.mockResolvedValue(null);
      mockFormatRepo.create.mockReturnValue({ source: DataSource.EAST_MONEY });
      mockFormatRepo.save.mockResolvedValue({});

      const result = await service.initStock('000001', '测试', [DataSource.EAST_MONEY]);

      expect(result.code).toBe('000001');
      expect(mockFormatRepo.save).toHaveBeenCalled();
    });

    it('should use existing stock', async () => {
      const existingStock = { id: 1, code: '000001', name: '测试' };
      mockStockRepo.findOne.mockResolvedValue(existingStock);
      mockFormatRepo.findOne.mockResolvedValue({});

      const result = await service.initStock('000001', '测试', [DataSource.EAST_MONEY]);

      expect(result).toEqual(existingStock);
      expect(mockStockRepo.create).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock.service.spec.ts`

Expected: FAIL with "StockService is not defined"

- [ ] **Step 4: Implement stock service**

```typescript
// apps/mist/src/stock/stock.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from '@app/shared-data/entities/stock.entity';
import { StockSourceFormat } from '@app/shared-data/entities/stock-source-format.entity';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Stock)
    private stockRepo: Repository<Stock>,
    @InjectRepository(StockSourceFormat)
    private formatRepo: Repository<StockSourceFormat>,
  ) {}

  async initStock(code: string, name: string, sources: DataSource[]) {
    let stock = await this.stockRepo.findOne({ where: { code } });

    if (!stock) {
      stock = this.stockRepo.create({ code, name });
      await this.stockRepo.save(stock);
    }

    for (const source of sources) {
      let format = await this.formatRepo.findOne({
        where: { stock: { id: stock.id }, source },
      });

      if (!format) {
        const formattedCode = this.formatCode(code, source);
        format = this.formatRepo.create({
          stock,
          source,
          formattedCode,
        });
        await this.formatRepo.save(format);
      }
    }

    return stock;
  }

  async addSource(code: string, source: DataSource) {
    const stock = await this.stockRepo.findOne({ where: { code } });
    if (!stock) {
      throw new NotFoundException(`股票 ${code} 不存在`);
    }

    const existing = await this.formatRepo.findOne({
      where: { stock: { id: stock.id }, source },
    });

    if (existing) {
      return existing;
    }

    const formattedCode = this.formatCode(code, source);
    const format = this.formatRepo.create({
      stock,
      source,
      formattedCode,
    });

    return await this.formatRepo.save(format);
  }

  private formatCode(code: string, source: DataSource): string {
    const formatters = {
      [DataSource.EAST_MONEY]: (c: string) => {
        const market = c.startsWith('6') ? 'sh' : 'sz';
        return `${market}${c}`;
      },
      [DataSource.TDX]: (c: string) => {
        const market = c.startsWith('6') ? 'SH' : 'SZ';
        return `${c}.${market}`;
      },
      [DataSource.MINI_QMT]: (c: string) => c,
    };

    return formatters[source](code);
  }
}
```

- [ ] **Step 5: Create stock module**

```typescript
// apps/mist/src/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockService } from './stock.service';
import { Stock } from '@app/shared-data/entities/stock.entity';
import { StockSourceFormat } from '@app/shared-data/entities/stock-source-format.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, StockSourceFormat])],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- stock.service.spec.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mist/src/stock/
git commit -m "feat: add stock service and module"
```

---

## Task 10: Create Data Collector Service Interface

**Files:**
- Create: `apps/mist/src/data-collector/interfaces/source-fetcher.interface.ts`
- Create: `apps/mist/src/data-collector/data-collector.module.ts`

- [ ] **Step 1: Define source fetcher interface**

```typescript
// apps/mist/src/data-collector/interfaces/source-fetcher.interface.ts
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

export interface KLineData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string;
  amount: number;
  extensions?: Record<string, any>;
}

export interface ISourceFetcher {
  /**
   * 获取K线数据
   */
  fetchKLine(
    formattedCode: string,
    period: string,
  ): Promise<KLineData[]>;

  /**
   * 检查是否支持该周期
   */
  isSupportedPeriod(period: KLinePeriod): boolean;
}
```

- [ ] **Step 2: Create data collector module**

```typescript
// apps/mist/src/data-collector/data-collector.module.ts
import { Module } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [StockModule],
  providers: [DataCollectorService],
  exports: [DataCollectorService],
})
export class DataCollectorModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/data-collector/
git commit -m "feat: add data collector interface and module"
```

---

## Task 11: Implement East Money Data Source

**Files:**
- Create: `apps/mist/src/sources/east-money.source.ts`
- Test: `apps/mist/src/sources/east-money.source.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/mist/src/sources/east-money.source.spec.ts
import { EastMoneySource } from './east-money.source';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';

describe('EastMoneySource', () => {
  let source: EastMoneySource;

  beforeEach(() => {
    source = new EastMoneySource();
  });

  it('should support 1min period', () => {
    expect(source.isSupportedPeriod(KLinePeriod.ONE_MIN)).toBe(true);
  });

  it('should not support quarterly period', () => {
    expect(source.isSupportedPeriod(KLinePeriod.QUARTERLY)).toBe(false);
  });

  it('should convert period to source format', () => {
    expect(source.getPeriodFormat(KLinePeriod.ONE_MIN)).toBe('1');
    expect(source.getPeriodFormat(KLinePeriod.DAILY)).toBe('daily');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- east-money.source.spec.ts`

Expected: FAIL

- [ ] **Step 3: Implement East Money source**

```typescript
// apps/mist/src/sources/east-money.source.ts
import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineData } from '../data-collector/interfaces/source-fetcher.interface';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { PeriodMapping } from '@app/shared-data/utils/period-mapping.util';
import { DataSource } from '@app/shared-data/enums/data-source.enum';
import axios from 'axios';

@Injectable()
export class EastMoneySource implements ISourceFetcher {
  private readonly baseUrl = 'http://127.0.0.1:8080'; // AKTools URL

  async fetchKLine(formattedCode: string, period: string): Promise<KLineData[]> {
    const url = `${this.baseUrl}/api/kline`;
    const response = await axios.post(url, {
      code: formattedCode,
      period: period,
    });

    return response.data.map((item: any) => ({
      timestamp: new Date(item.日期),
      open: parseFloat(item.开盘),
      high: parseFloat(item.最高),
      low: parseFloat(item.最低),
      close: parseFloat(item.收盘),
      volume: item.成交量.toString(),
      amount: item.成交额,
      extensions: {
        amplitude: item.振幅,
        changePct: item.涨跌幅,
        changeAmt: item.涨跌额,
        turnoverRate: item.换手率,
      },
    }));
  }

  isSupportedPeriod(period: KLinePeriod): boolean {
    return PeriodMapping.isSupported(period, DataSource.EAST_MONEY);
  }

  getPeriodFormat(period: KLinePeriod): string {
    return PeriodMapping.toSourceFormat(period, DataSource.EAST_MONEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- east-money.source.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/sources/east-money.source.ts
git commit -m "feat: add east money data source"
```

---

## Task 12: Implement TDX Data Source

**Files:**
- Create: `apps/mist/src/sources/tdx.source.ts`
- Test: `apps/mist/src/sources/tdx.source.spec.ts`

- [ ] **Step 1-4: Similar to Task 11, implement TDX source**

(Steps follow same pattern as East Money source)

```typescript
// apps/mist/src/sources/tdx.source.ts
import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineData } from '../data-collector/interfaces/source-fetcher.interface';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { PeriodMapping } from '@app/shared-data/utils/period-mapping.util';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

@Injectable()
export class TdxSource implements ISourceFetcher {
  async fetchKLine(formattedCode: string, period: string): Promise<KLineData[]> {
    // TODO: Implement TDX API call
    return [];
  }

  isSupportedPeriod(period: KLinePeriod): boolean {
    return PeriodMapping.isSupported(period, DataSource.TDX);
  }

  getPeriodFormat(period: KLinePeriod): string {
    return PeriodMapping.toSourceFormat(period, DataSource.TDX);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/sources/tdx.source.ts
git commit -m "feat: add tdx data source"
```

---

## Task 13: Implement Data Collector Service

**Files:**
- Modify: `apps/mist/src/data-collector/data-collector.service.ts`
- Test: `apps/mist/src/data-collector/data-collector.service.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/mist/src/data-collector/data-collector.service.spec.ts
import { Test } from '@nestjs/testing';
import { DataCollectorService } from './data-collector.service';
import { StockService } from '../stock/stock.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KLine } from '@app/shared-data/entities/kline.entity';
import { KLineExtensionEf } from '@app/shared-data/entities/kline-extension-ef.entity';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

describe('DataCollectorService', () => {
  let service: DataCollectorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DataCollectorService,
        {
          provide: StockService,
          useValue: {
            findByCode: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KLine),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KLineExtensionEf),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataCollectorService>(DataCollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- data-collector.service.spec.ts`

Expected: FAIL

- [ ] **Step 3: Implement data collector service**

```typescript
// apps/mist/src/data-collector/data-collector.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { DataSource } from '@app/shared-data/enums/data-source.enum';
import { KLine } from '@app/shared-data/entities/kline.entity';
import { KLineExtensionEf } from '@app/shared-data/entities/kline-extension-ef.entity';
import { KLineExtensionTdx } from '@app/shared-data/entities/kline-extension-tdx.entity';
import { StockService } from '../stock/stock.service';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { PeriodMapping } from '@app/shared-data/utils/period-mapping.util';

@Injectable()
export class DataCollectorService {
  private sources: Map<DataSource, any>;

  constructor(
    @InjectRepository(KLine)
    private klineRepo: Repository<KLine>,
    @InjectRepository(KLineExtensionEf)
    private efExtRepo: Repository<KLineExtensionEf>,
    @InjectRepository(KLineExtensionTdx)
    private tdxExtRepo: Repository<KLineExtensionTdx>,
    private stockService: StockService,
  ) {
    this.sources = new Map([
      [DataSource.EAST_MONEY, new EastMoneySource()],
      [DataSource.TDX, new TdxSource()],
    ]);
  }

  async collectKLine(
    code: string,
    period: KLinePeriod,
    source: DataSource,
  ) {
    const fetcher = this.sources.get(source);
    if (!fetcher) {
      throw new NotFoundException(`数据源 ${source} 未实现`);
    }

    if (!fetcher.isSupportedPeriod(period)) {
      throw new Error(`数据源 ${source} 不支持周期 ${period}`);
    }

    const stock = await this.stockService.findByCode(code);
    if (!stock) {
      throw new NotFoundException(`股票 ${code} 不存在，请先初始化`);
    }

    const format = await this.stockService.getSourceFormat(stock.id, source);
    if (!format) {
      throw new NotFoundException(`股票 ${code} 未配置数据源 ${source}`);
    }

    const sourcePeriod = PeriodMapping.toSourceFormat(period, source);
    const rawData = await fetcher.fetchKLine(format.formattedCode, sourcePeriod);

    for (const item of rawData) {
      await this.saveKLineData(stock.id, source, period, item);
    }

    return rawData.length;
  }

  private async saveKLineData(
    stockId: number,
    source: DataSource,
    period: KLinePeriod,
    data: any,
  ) {
    const kline = this.klineRepo.create({
      stock: { id: stockId },
      source,
      period,
      timestamp: data.timestamp,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      amount: data.amount,
    });

    const savedKline = await this.klineRepo.save(kline);

    // 保存扩展数据
    if (source === DataSource.EAST_MONEY && data.extensions) {
      const efExt = this.efExtRepo.create({
        kline: savedKline,
        amplitude: data.extensions.amplitude,
        changePct: data.extensions.changePct,
        changeAmt: data.extensions.changeAmt,
        turnoverRate: data.extensions.turnoverRate,
      });
      await this.efExtRepo.save(efExt);
    } else if (source === DataSource.TDX && data.extensions) {
      const tdxExt = this.tdxExtRepo.create({
        kline: savedKline,
        forwardFactor: data.extensions.forwardFactor,
      });
      await this.tdxExtRepo.save(tdxExt);
    }
  }
}
```

- [ ] **Step 4: Update stock service with missing methods**

```typescript
// apps/mist/src/stock/stock.service.ts - Add these methods

async findByCode(code: string) {
  return await this.stockRepo.findOne({ where: { code } });
}

async getSourceFormat(stockId: number, source: DataSource) {
  return await this.formatRepo.findOne({
    where: { stock: { id: stockId }, source },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test -- data-collector.service.spec.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mist/src/data-collector/
git commit -m "feat: implement data collector service"
```

---

## Task 14: Create Stock Controller and API

**Files:**
- Create: `apps/mist/src/stock/stock.controller.ts`
- Modify: `apps/mist/src/stock/stock.module.ts`

- [ ] **Step 1: Create stock controller**

```typescript
// apps/mist/src/stock/stock.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { StockService } from './stock.service';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('init')
  async initStock(@Body() dto: InitStockDto) {
    const stock = await this.stockService.initStock(
      dto.code,
      dto.name,
      dto.sources,
    );
    return {
      success: true,
      data: stock,
    };
  }

  @Post('add-source')
  async addSource(@Body() dto: AddSourceDto) {
    const format = await this.stockService.addSource(dto.code, dto.source);
    return {
      success: true,
      data: format,
    };
  }

  @Get(':code')
  async getStock(@Param('code') code: string) {
    const stock = await this.stockService.findByCode(code);
    if (!stock) {
      return {
        success: false,
        message: '股票不存在',
      };
    }
    return {
      success: true,
      data: stock,
    };
  }
}
```

- [ ] **Step 2: Update stock module**

```typescript
// apps/mist/src/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { Stock } from '@app/shared-data/entities/stock.entity';
import { StockSourceFormat } from '@app/shared-data/entities/stock-source-format.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Stock, StockSourceFormat])],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
```

- [ ] **Step 3: Test API**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run start:dev:mist`

Test with curl:
```bash
curl -X POST http://localhost:8001/stock/init \
  -H "Content-Type: application/json" \
  -d '{"code":"000001","name":"平安银行","sources":["ef"]}'
```

Expected: Success response

- [ ] **Step 4: Commit**

```bash
git add apps/mist/src/stock/
git commit -m "feat: add stock controller and API endpoints"
```

---

## Task 15: Create Data Collector API

**Files:**
- Create: `apps/mist/src/data-collector/data-collector.controller.ts`
- Create: `apps/mist/src/data-collector/dto/collect-kline.dto.ts`
- Modify: `apps/mist/src/data-collector/data-collector.module.ts`

- [ ] **Step 1: Create DTO**

```typescript
// apps/mist/src/data-collector/dto/collect-kline.dto.ts
import { IsString, IsEnum } from 'class-validator';
import { KLinePeriod } from '@app/shared-data/enums/kline-period.enum';
import { DataSource } from '@app/shared-data/enums/data-source.enum';

export class CollectKlineDto {
  @IsString()
  code: string;

  @IsEnum(KLinePeriod)
  period: KLinePeriod;

  @IsEnum(DataSource)
  source: DataSource;
}
```

- [ ] **Step 2: Create controller**

```typescript
// apps/mist/src/data-collector/data-collector.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { CollectKlineDto } from './dto/collect-kline.dto';

@Controller('data-collector')
export class DataCollectorController {
  constructor(private readonly collectorService: DataCollectorService) {}

  @Post('collect')
  async collectKline(@Body() dto: CollectKlineDto) {
    try {
      const count = await this.collectorService.collectKLine(
        dto.code,
        dto.period,
        dto.source,
      );
      return {
        success: true,
        message: `成功采集 ${count} 条数据`,
        data: { count },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
```

- [ ] **Step 3: Update module**

```typescript
// apps/mist/src/data-collector/data-collector.module.ts
import { Module } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { DataCollectorController } from './data-collector.controller';
import { StockModule } from '../stock/stock.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KLine } from '@app/shared-data/entities/kline.entity';
import { KLineExtensionEf } from '@app/shared-data/entities/kline-extension-ef.entity';
import { KLineExtensionTdx } from '@app/shared-data/entities/kline-extension-tdx.entity';

@Module({
  imports: [
    StockModule,
    TypeOrmModule.forFeature([KLine, KLineExtensionEf, KLineExtensionTdx]),
  ],
  controllers: [DataCollectorController],
  providers: [DataCollectorService],
  exports: [DataCollectorService],
})
export class DataCollectorModule {}
```

- [ ] **Step 4: Test API**

```bash
curl -X POST http://localhost:8001/data-collector/collect \
  -H "Content-Type: application/json" \
  -d '{"code":"000001","period":"daily","source":"ef"}'
```

Expected: Success response

- [ ] **Step 5: Commit**

```bash
git add apps/mist/src/data-collector/
git commit -m "feat: add data collector controller and API"
```

---

## Task 16: Integrate with App Module

**Files:**
- Modify: `apps/mist/src/app.module.ts`

- [ ] **Step 1: Import new modules**

```typescript
// apps/mist/src/app.module.ts
import { Module } from '@nestjs/common';
import { StockModule } from './stock/stock.module';
import { DataCollectorModule } from './data-collector/data-collector.module';
// ... existing imports

@Module({
  imports: [
    // ... existing modules
    StockModule,
    DataCollectorModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 2: Verify app starts**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run start:dev:mist`

Expected: No errors, app starts successfully

- [ ] **Step 3: Commit**

```bash
git add apps/mist/src/app.module.ts
git commit -m "chore: integrate stock and data-collector modules"
```

---

## Task 17: Integration Testing

**Files:**
- Create: `apps/mist/test/integration/multi-data-source.e2e-spec.ts`

- [ ] **Step 1: Write integration test**

```typescript
// apps/mist/test/integration/multi-data-source.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Multi-Data Source Integration (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/stock/init (POST)', () => {
    return request(app.getHttpServer())
      .post('/stock/init')
      .send({
        code: '000001',
        name: '测试股票',
        sources: ['ef'],
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.code).toBe('000001');
      });
  });

  it('/stock/add-source (POST)', () => {
    return request(app.getHttpServer())
      .post('/stock/add-source')
      .send({
        code: '000001',
        source: 'tdx',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });

  it('/data-collector/collect (POST)', () => {
    return request(app.getHttpServer())
      .post('/data-collector/collect')
      .send({
        code: '000001',
        period: 'daily',
        source: 'ef',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.count).toBeGreaterThan(0);
      });
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run test:e2e`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mist/test/integration/
git commit -m "test: add multi-data source integration tests"
```

---

## Task 18: Documentation

**Files:**
- Modify: `README.md` (if applicable)
- Modify: `CLAUDE.md` (if applicable)

- [ ] **Step 1: Update README with new API endpoints**

```markdown
## Multi-Data Source K-Line API

### Initialize Stock
```bash
POST /stock/init
{
  "code": "000001",
  "name": "平安银行",
  "sources": ["ef", "tdx"]
}
```

### Add Data Source
```bash
POST /stock/add-source
{
  "code": "000001",
  "source": "ef"
}
```

### Collect K-Line Data
```bash
POST /data-collector/collect
{
  "code": "000001",
  "period": "daily",
  "source": "ef"
}
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add multi-data source API documentation"
```

---

## Task 19: Final Verification

- [ ] **Step 1: Run all tests**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm test`

Expected: All tests pass

- [ ] **Step 2: Build project**

Run: `cd /Users/xiyugao/code/mist/mist && pnpm run build`

Expected: Build succeeds

- [ ] **Step 3: Manual testing**

1. Start dev server
2. Initialize a stock
3. Collect K-line data
4. Query data from database

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final verification and cleanup"
```

---

## Completion Criteria

- [ ] All entities created and tested
- [ ] Database migration applied successfully
- [ ] Stock service can initialize stocks and add sources
- [ ] Data collector can fetch from multiple sources
- [ ] API endpoints working correctly
- [ ] All tests passing
- [ ] Documentation updated

---

## Notes

- **TDD Approach**: Each task follows write test → implement → verify pattern
- **Frequent Commits**: Commit after each completed task
- **YAGNI**: Only implement what's needed for current requirements
- **miniQMT**: Placeholder created, implementation deferred until API available
