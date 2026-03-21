# 统一数据表架构实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 重构数据表架构，统一股票和指数为 Securities，统一日线和分钟线为 MarketDataBars，支持多数据源扩展

**架构:** 删除旧表（stocks, index_datas, index_dailys, index_periods, k_lines），创建新表（securities, security_source_configs, market_data_bars, 扩展表），废弃旧数据重新采集

**Tech Stack:** NestJS, TypeORM, MySQL, TypeScript

---

## 文件结构规划

### 新建文件

```
libs/shared-data/src/
├── entities/
│   ├── security.entity.ts                    # 证券主表
│   ├── security-source-config.entity.ts      # 数据源配置
│   ├── market-data-bar.entity.ts             # K线主表
│   ├── market-data-extension-ef.entity.ts    # EF扩展表
│   ├── market-data-extension-tdx.entity.ts   # TDX扩展表
│   └── market-data-extension-mqmt.entity.ts  # MQMT扩展表
├── enums/
│   ├── security-type.enum.ts                 # 证券类型 (STOCK/INDEX)
│   ├── security-status.enum.ts               # 证券状态
│   └── bar-period.enum.ts                    # K线周期 (重命名 kline-period.enum.ts)
├── dto/
│   ├── query-market-data.dto.ts              # 查询DTO
│   ├── save-security.dto.ts                  # 保存证券DTO
│   └── save-market-data.dto.ts               # 保存K线DTO
└── vo/
    └── market-data-bar.vo.ts                 # 返回VO

apps/mist/src/market-data/                    # 新模块
├── market-data.controller.ts                 # 控制器
├── market-data.service.ts                    # 服务
├── market-data.module.ts                     # 模块
└── dto/
    └── query-bars.dto.ts                     # 查询参数DTO

apps/mist/src/migrations/
└── 20260321000000-UnifiedDataSchema.ts       # TypeORM迁移文件
```

### 修改文件

```
libs/shared-data/src/
├── entities/index.ts                         # 导出新实体
└── enums/
    └── data-source.enum.ts                   # 已存在，无需修改

apps/mist/src/
├── data/
│   ├── data.service.ts                       # 更新为使用新实体
│   └── data.controller.ts                    # 更新接口
├── indicator/
│   ├── indicator.service.ts                  # 更新数据源
│   └── indicator.controller.ts               # 更新接口
└── app.module.ts                             # 导入新模块
```

### 删除文件

```
libs/shared-data/src/entities/
├── stock.entity.ts                           # 删除
├── stock-source-format.entity.ts             # 删除
├── kline.entity.ts                           # 删除
├── kline-extension-ef.entity.ts              # 删除
├── kline-extension-tdx.entity.ts             # 删除
├── kline-extension-mqmt.entity.ts            # 删除
├── index-data.entity.ts                      # 删除
├── index-daily.entity.ts                     # 删除
└── index-period.entity.ts                    # 删除

libs/shared-data/src/enums/
└── kline-period.enum.ts                      # 删除（重命名为 bar-period.enum.ts）

libs/shared-data/src/vo/
├── index.vo.ts                               # 删除
└── index-daily.vo.ts                         # 删除
```

---

## Task 1: 创建枚举类型

**Files:**
- Create: `libs/shared-data/src/enums/security-type.enum.ts`
- Create: `libs/shared-data/src/enums/security-status.enum.ts`
- Create: `libs/shared-data/src/enums/bar-period.enum.ts`

- [ ] **Step 1: Create SecurityType enum**

```typescript
// libs/shared-data/src/enums/security-type.enum.ts
export enum SecurityType {
  STOCK = 'STOCK',   // 股票
  INDEX = 'INDEX',   // 指数
}
```

- [ ] **Step 2: Create SecurityStatus enum**

```typescript
// libs/shared-data/src/enums/security-status.enum.ts
export enum SecurityStatus {
  DELISTED = -1,  // 退市/终止运行
  SUSPENDED = 0,  // 停牌
  ACTIVE = 1,     // 正常/活跃
}
```

- [ ] **Step 3: Create BarPeriod enum**

```typescript
// libs/shared-data/src/enums/bar-period.enum.ts
export enum BarPeriod {
  MIN_1 = '1min',
  MIN_5 = '5min',
  MIN_15 = '15min',
  MIN_30 = '30min',
  MIN_60 = '60min',
  DAILY = 'daily',
}
```

- [ ] **Step 4: Commit enums**

```bash
git add libs/shared-data/src/enums/
git commit -m "feat: add security and bar period enums"
```

---

## Task 2: 创建 Security 实体

**Files:**
- Create: `libs/shared-data/src/entities/security.entity.ts`

- [ ] **Step 1: Create Security entity**

```typescript
// libs/shared-data/src/entities/security.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { SecurityType } from '../enums/security-type.enum';
import { SecurityStatus } from '../enums/security-status.enum';
import { SecuritySourceConfig } from './security-source-config.entity';
import { MarketDataBar } from './market-data-bar.entity';

@Entity({ name: 'securities' })
@Unique(['code'])
export class Security {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: '纯代码，如 000001, 000300',
  })
  code: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '证券名称',
  })
  name: string;

  @Column({
    type: 'enum',
    enum: SecurityType,
    comment: '证券类型：STOCK=股票，INDEX=指数',
  })
  type: SecurityType;

  @Column({
    type: 'varchar',
    length: 10,
    comment: '交易所：SH=上交所，SZ=深交所，CSI=中证指数',
  })
  exchange: string;

  @Column({
    type: 'tinyint',
    default: SecurityStatus.ACTIVE,
    comment: '状态：1=正常，0=停牌，-1=退市/终止',
  })
  status: SecurityStatus;

  @OneToMany(() => SecuritySourceConfig, (config) => config.security)
  sourceConfigs: SecuritySourceConfig[];

  @OneToMany(() => MarketDataBar, (bar) => bar.security)
  marketDataBars: MarketDataBar[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Commit Security entity**

```bash
git add libs/shared-data/src/entities/security.entity.ts
git commit -m "feat: add Security entity"
```

---

## Task 3: 创建 SecuritySourceConfig 实体

**Files:**
- Create: `libs/shared-data/src/entities/security-source-config.entity.ts`

- [ ] **Step 1: Create SecuritySourceConfig entity**

```typescript
// libs/shared-data/src/entities/security-source-config.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Security } from './security.entity';
import { DataSource } from '../enums/data-source.enum';

@Entity({ name: 'security_source_configs' })
@Unique(['securityId', 'source'])
export class SecuritySourceConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Security, (security) => security.sourceConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'security_id' })
  security: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '数据源特定的代码格式',
  })
  formatCode: string;

  @Column({
    type: 'int',
    default: 0,
    comment: '优先级，数字越大越优先',
  })
  priority: number;

  @Column({
    type: 'boolean',
    default: true,
    comment: '是否启用该数据源',
  })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Commit SecuritySourceConfig entity**

```bash
git add libs/shared-data/src/entities/security-source-config.entity.ts
git commit -m "feat: add SecuritySourceConfig entity"
```

---

## Task 4: 创建 MarketDataBar 实体

**Files:**
- Create: `libs/shared-data/src/entities/market-data-bar.entity.ts`

- [ ] **Step 1: Create MarketDataBar entity**

```typescript
// libs/shared-data/src/entities/market-data-bar.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Security } from './security.entity';
import { DataSource } from '../enums/data-source.enum';
import { BarPeriod } from '../enums/bar-period.enum';
import { MarketDataExtensionEf } from './market-data-extension-ef.entity';
import { MarketDataExtensionTdx } from './market-data-extension-tdx.entity';
import { MarketDataExtensionMqmt } from './market-data-extension-mqmt.entity';

@Entity({ name: 'market_data_bars' })
@Unique(['securityId', 'source', 'period', 'timestamp'])
export class MarketDataBar {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Security, (security) => security.marketDataBars, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'security_id' })
  security: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource;

  @Column({
    type: 'enum',
    enum: BarPeriod,
    comment: 'K线周期：1min, 5min, 15min, 30min, 60min, daily',
  })
  period: BarPeriod;

  @Column({
    type: 'datetime',
    comment: 'K线时间戳',
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
    comment: '成交量 (手)',
  })
  volume: bigint;

  @Column({
    type: 'double',
    comment: '成交额 (元)',
  })
  amount: number;

  // 扩展表关联 (可选)
  @OneToOne(() => MarketDataExtensionEf, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  extensionEf: MarketDataExtensionEf;

  @OneToOne(() => MarketDataExtensionTdx, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  extensionTdx: MarketDataExtensionTdx;

  @OneToOne(() => MarketDataExtensionMqmt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  extensionMqmt: MarketDataExtensionMqmt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 2: Commit MarketDataBar entity**

```bash
git add libs/shared-data/src/entities/market-data-bar.entity.ts
git commit -m "feat: add MarketDataBar entity"
```

---

## Task 5: 创建扩展表实体

**Files:**
- Create: `libs/shared-data/src/entities/market-data-extension-ef.entity.ts`
- Create: `libs/shared-data/src/entities/market-data-extension-tdx.entity.ts`
- Create: `libs/shared-data/src/entities/market-data-extension-mqmt.entity.ts`

- [ ] **Step 1: Create MarketDataExtensionEf entity**

```typescript
// libs/shared-data/src/entities/market-data-extension-ef.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketDataBar } from './market-data-bar.entity';

@Entity({ name: 'market_data_extensions_ef' })
export class MarketDataExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionEf, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bar_id' })
  marketDataBar: MarketDataBar;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 2: Create MarketDataExtensionTdx entity**

```typescript
// libs/shared-data/src/entities/market-data-extension-tdx.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketDataBar } from './market-data-bar.entity';

@Entity({ name: 'market_data_extensions_tdx' })
export class MarketDataExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionTdx, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bar_id' })
  marketDataBar: MarketDataBar;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 3: Create MarketDataExtensionMqmt entity**

```typescript
// libs/shared-data/src/entities/market-data-extension-mqmt.entity.ts
import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketDataBar } from './market-data-bar.entity';

@Entity({ name: 'market_data_extensions_mqmt' })
export class MarketDataExtensionMqmt {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionMqmt, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bar_id' })
  marketDataBar: MarketDataBar;

  // TODO: 待补充 miniQMT 特有字段

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 4: Commit extension entities**

```bash
git add libs/shared-data/src/entities/market-data-extension-*.entity.ts
git commit -m "feat: add market data extension entities"
```

---

## Task 6: 更新实体导出

**Files:**
- Modify: `libs/shared-data/src/entities/index.ts`

- [ ] **Step 1: Update entities index**

```typescript
// libs/shared-data/src/entities/index.ts
export * from './security.entity';
export * from './security-source-config.entity';
export * from './market-data-bar.entity';
export * from './market-data-extension-ef.entity';
export * from './market-data-extension-tdx.entity';
export * from './market-data-extension-mqmt.entity';
```

- [ ] **Step 2: Commit index update**

```bash
git add libs/shared-data/src/entities/index.ts
git commit -m "refactor: update entities index exports"
```

---

## Task 7: 创建 DTO 和 VO

**Files:**
- Create: `libs/shared-data/src/dto/query-market-data.dto.ts`
- Create: `libs/shared-data/src/dto/save-security.dto.ts`
- Create: `libs/shared-data/src/dto/save-market-data.dto.ts`
- Create: `libs/shared-data/src/vo/market-data-bar.vo.ts`

- [ ] **Step 1: Create QueryMarketDataDto**

```typescript
// libs/shared-data/src/dto/query-market-data.dto.ts
import { IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';
import { BarPeriod } from '../enums/bar-period.enum';

export class QueryMarketDataDto {
  @IsString()
  code: string;

  @IsEnum(BarPeriod)
  period: BarPeriod;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
```

- [ ] **Step 2: Create SaveSecurityDto**

```typescript
// libs/shared-data/src/dto/save-security.dto.ts
import { IsEnum, IsString, IsInt, IsOptional, Min } from 'class-validator';
import { SecurityType } from '../enums/security-type.enum';
import { SecurityStatus } from '../enums/security-status.enum';

export class SaveSecurityDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(SecurityType)
  type: SecurityType;

  @IsString()
  exchange: string;

  @IsOptional()
  @IsInt()
  @Min(-1)
  status?: SecurityStatus;
}
```

- [ ] **Step 3: Create SaveMarketDataDto**

```typescript
// libs/shared-data/src/dto/save-market-data.dto.ts
import { IsEnum, IsDateString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { DataSource } from '../enums/data-source.enum';
import { BarPeriod } from '../enums/bar-period.enum';

export class SaveMarketDataDto {
  @IsString()
  code: string;

  @IsEnum(DataSource)
  source: DataSource;

  @IsEnum(BarPeriod)
  period: BarPeriod;

  @IsDateString()
  timestamp: string;

  @IsNumber()
  open: number;

  @IsNumber()
  high: number;

  @IsNumber()
  low: number;

  @IsNumber()
  close: number;

  @IsNumber()
  volume: number;

  @IsNumber()
  amount: number;

  // EF 扩展字段
  @IsOptional()
  @IsNumber()
  amplitude?: number;

  @IsOptional()
  @IsNumber()
  changePct?: number;

  @IsOptional()
  @IsNumber()
  changeAmt?: number;

  @IsOptional()
  @IsNumber()
  turnoverRate?: number;

  // TDX 扩展字段
  @IsOptional()
  @IsNumber()
  forwardFactor?: number;
}
```

- [ ] **Step 4: Create MarketDataBarVo**

```typescript
// libs/shared-data/src/vo/market-data-bar.vo.ts
import { SecurityType } from '../enums/security-type.enum';
import { DataSource } from '../enums/data-source.enum';
import { BarPeriod } from '../enums/bar-period.enum';

export interface MarketDataBarVo {
  id: number;
  code: string;
  name: string;
  type: SecurityType;
  source: DataSource;
  period: BarPeriod;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
  amount: number;
  // 扩展字段 (根据 source 动态包含)
  amplitude?: number;
  changePct?: number;
  changeAmt?: number;
  turnoverRate?: number;
  forwardFactor?: number;
}
```

- [ ] **Step 5: Commit DTOs and VO**

```bash
git add libs/shared-data/src/dto/ libs/shared-data/src/vo/
git commit -m "feat: add DTOs and VOs for market data"
```

---

## Task 8: 创建 TypeORM 迁移文件

**Files:**
- Create: `apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts`

- [ ] **Step 1: Create migration file**

```typescript
// apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifiedDataSchema1679385600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 securities 表
    await queryRunner.query(`
      CREATE TABLE \`securities\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`code\` varchar(20) NOT NULL COMMENT '纯代码',
        \`name\` varchar(100) NOT NULL COMMENT '证券名称',
        \`type\` enum('STOCK','INDEX') NOT NULL COMMENT '证券类型',
        \`exchange\` varchar(10) NOT NULL COMMENT '交易所',
        \`status\` tinyint NOT NULL DEFAULT '1' COMMENT '状态',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_code\` (\`code\`),
        KEY \`IDX_type\` (\`type\`),
        KEY \`IDX_exchange\` (\`exchange\`),
        KEY \`IDX_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. 创建 security_source_configs 表
    await queryRunner.query(`
      CREATE TABLE \`security_source_configs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`security_id\` int NOT NULL COMMENT '关联 securities.id',
        \`source\` enum('ef','tdx','mqmt') NOT NULL COMMENT '数据源',
        \`format_code\` varchar(50) NOT NULL COMMENT '数据源特定代码',
        \`priority\` int NOT NULL DEFAULT '0' COMMENT '优先级',
        \`enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_security_source\` (\`security_id\`, \`source\`),
        KEY \`IDX_security_id\` (\`security_id\`),
        KEY \`IDX_priority\` (\`priority\`),
        CONSTRAINT \`fk_security_source_configs_security\` FOREIGN KEY (\`security_id\`) REFERENCES \`securities\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. 创建 market_data_bars 表
    await queryRunner.query(`
      CREATE TABLE \`market_data_bars\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`security_id\` int NOT NULL COMMENT '关联 securities.id',
        \`source\` enum('ef','tdx','mqmt') NOT NULL COMMENT '数据源',
        \`period\` enum('1min','5min','15min','30min','60min','daily') NOT NULL COMMENT 'K线周期',
        \`timestamp\` datetime NOT NULL COMMENT 'K线时间戳',
        \`open\` decimal(12,2) NOT NULL COMMENT '开盘价',
        \`high\` decimal(12,2) NOT NULL COMMENT '最高价',
        \`low\` decimal(12,2) NOT NULL COMMENT '最低价',
        \`close\` decimal(12,2) NOT NULL COMMENT '收盘价',
        \`volume\` bigint NOT NULL COMMENT '成交量 (手)',
        \`amount\` double NOT NULL COMMENT '成交额 (元)',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_bar\` (\`security_id\`, \`source\`, \`period\`, \`timestamp\`),
        KEY \`IDX_security_id\` (\`security_id\`),
        KEY \`IDX_source\` (\`source\`),
        KEY \`IDX_period\` (\`period\`),
        KEY \`IDX_timestamp\` (\`timestamp\`),
        KEY \`IDX_security_period_time\` (\`security_id\`, \`period\`, \`timestamp\`),
        CONSTRAINT \`fk_market_data_bars_security\` FOREIGN KEY (\`security_id\`) REFERENCES \`securities\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 4. 创建 market_data_extensions_ef 表
    await queryRunner.query(`
      CREATE TABLE \`market_data_extensions_ef\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`bar_id\` int NULL COMMENT '关联 market_data_bars.id',
        \`amplitude\` decimal(10,2) NULL COMMENT '振幅（%）',
        \`change_pct\` decimal(10,2) NULL COMMENT '涨跌幅（%）',
        \`change_amt\` decimal(10,2) NULL COMMENT '涨跌额（元）',
        \`turnover_rate\` decimal(10,2) NULL COMMENT '换手率（%）',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_bar_id\` (\`bar_id\`),
        KEY \`IDX_bar_id\` (\`bar_id\`),
        CONSTRAINT \`fk_market_data_extensions_ef_bar\` FOREIGN KEY (\`bar_id\`) REFERENCES \`market_data_bars\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 5. 创建 market_data_extensions_tdx 表
    await queryRunner.query(`
      CREATE TABLE \`market_data_extensions_tdx\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`bar_id\` int NULL COMMENT '关联 market_data_bars.id',
        \`forward_factor\` decimal(12,6) NULL COMMENT '前复权因子',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_bar_id\` (\`bar_id\`),
        KEY \`IDX_bar_id\` (\`bar_id\`),
        CONSTRAINT \`fk_market_data_extensions_tdx_bar\` FOREIGN KEY (\`bar_id\`) REFERENCES \`market_data_bars\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 6. 创建 market_data_extensions_mqmt 表
    await queryRunner.query(`
      CREATE TABLE \`market_data_extensions_mqmt\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`bar_id\` int NULL COMMENT '关联 market_data_bars.id',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_bar_id\` (\`bar_id\`),
        KEY \`IDX_bar_id\` (\`bar_id\`),
        CONSTRAINT \`fk_market_data_extensions_mqmt_bar\` FOREIGN KEY (\`bar_id\`) REFERENCES \`market_data_bars\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 7. 删除旧表
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_ef\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_tdx\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_mqmt\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_lines\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`stock_source_formats\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`stocks\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`index_dailys\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`index_periods\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`index_datas\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除新表
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_data_extensions_mqmt\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_data_extensions_tdx\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_data_extensions_ef\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`market_data_bars\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`security_source_configs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`securities\``);
  }
}
```

- [ ] **Step 2: Commit migration file**

```bash
git add apps/mist/src/migrations/20260321000000-UnifiedDataSchema.ts
git commit -m "feat: add TypeORM migration for unified data schema"
```

---

## Task 9: 创建 MarketData 模块

**Files:**
- Create: `apps/mist/src/market-data/market-data.module.ts`
- Create: `apps/mist/src/market-data/market-data.service.ts`
- Create: `apps/mist/src/market-data/market-data.controller.ts`
- Create: `apps/mist/src/market-data/dto/query-bars.dto.ts`

- [ ] **Step 1: Create QueryBarsDto**

```typescript
// apps/mist/src/market-data/dto/query-bars.dto.ts
import { IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { BarPeriod } from '@app/shared-data';

export class QueryBarsDto {
  @IsString()
  code: string;

  @IsEnum(BarPeriod)
  @IsOptional()
  period?: BarPeriod;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
```

- [ ] **Step 2: Create MarketDataService**

```typescript
// apps/mist/src/market-data/market-data.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MarketDataBar, Security, BarPeriod } from '@app/shared-data';
import { QueryBarsDto } from './dto/query-bars.dto';
import { MarketDataBarVo } from '@app/shared-data';

@Injectable()
export class MarketDataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private barRepository: Repository<MarketDataBar>,
  ) {}

  async queryBars(dto: QueryBarsDto): Promise<MarketDataBarVo[]> {
    // 查找证券
    const security = await this.securityRepository.findOne({
      where: { code: dto.code },
    });

    if (!security) {
      throw new NotFoundException(`Security ${dto.code} not found`);
    }

    // 构建查询条件
    const where: any = {
      security: { id: security.id },
    };

    if (dto.period) {
      where.period = dto.period;
    }

    if (dto.startDate && dto.endDate) {
      where.timestamp = Between(new Date(dto.startDate), new Date(dto.endDate));
    }

    // 查询K线数据
    const bars = await this.barRepository.find({
      relations: ['security', 'extensionEf', 'extensionTdx', 'extensionMqmt'],
      where,
      order: {
        timestamp: 'ASC',
      },
    });

    // 转换为 VO
    return bars.map((bar) => ({
      id: bar.id,
      code: bar.security.code,
      name: bar.security.name,
      type: bar.security.type,
      source: bar.source,
      period: bar.period,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
      // 扩展字段
      ...(bar.extensionEf && {
        amplitude: bar.extensionEf.amplitude,
        changePct: bar.extensionEf.changePct,
        changeAmt: bar.extensionEf.changeAmt,
        turnoverRate: bar.extensionEf.turnoverRate,
      }),
      ...(bar.extensionTdx && {
        forwardFactor: bar.extensionTdx.forwardFactor,
      }),
    }));
  }
}
```

- [ ] **Step 3: Create MarketDataController**

```typescript
// apps/mist/src/market-data/market-data.controller.ts
import { Controller, Get, Query, UseInterceptors, UseFilters } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { MarketDataService } from './market-data.service';
import { QueryBarsDto } from './dto/query-bars.dto';

@ApiTags('market-data')
@Controller('market-data')
@UseInterceptors(TransformInterceptor)
@UseFilters(AllExceptionsFilter)
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('bars')
  @ApiOperation({
    summary: 'Get market data bars',
    description: 'Retrieve K-line data for specified security and period',
  })
  async getBars(@Query() query: QueryBarsDto) {
    return await this.marketDataService.queryBars(query);
  }
}
```

- [ ] **Step 4: Create MarketDataModule**

```typescript
// apps/mist/src/market-data/market-data.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { Security, MarketDataBar } from '@app/shared-data';

@Module({
  imports: [TypeOrmModule.forFeature([Security, MarketDataBar])],
  controllers: [MarketDataController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
```

- [ ] **Step 5: Commit MarketData module**

```bash
git add apps/mist/src/market-data/
git commit -m "feat: add MarketData module with unified API"
```

---

## Task 10: 更新 App Module

**Files:**
- Modify: `apps/mist/src/app.module.ts`

- [ ] **Step 1: Import MarketDataModule**

在 `apps/mist/src/app.module.ts` 中添加：

```typescript
import { MarketDataModule } from './market-data/market-data.module';

@Module({
  imports: [
    // ... 其他模块
    MarketDataModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 2: Commit app module update**

```bash
git add apps/mist/src/app.module.ts
git commit -m "refactor: import MarketDataModule in AppModule"
```

---

## Task 11: 更新 DataService

**Files:**
- Modify: `apps/mist/src/data/data.service.ts`

- [ ] **Step 1: Update DataService to use new entities**

```typescript
// apps/mist/src/data/data.service.ts
import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Security, MarketDataBar, BarPeriod, SecurityType } from '@app/shared-data';

@Injectable()
export class DataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private barRepository: Repository<MarketDataBar>,
  ) {}

  async initData() {
    // 初始化上证指数
    let index = await this.securityRepository.findOne({
      where: { code: '000001' },
    });
    if (!index) {
      index = this.securityRepository.create({
        code: '000001',
        name: '上证指数',
        type: SecurityType.INDEX,
        exchange: 'SH',
        status: 1,
      });
      await this.securityRepository.save(index);
    }

    // 初始化沪深300
    let index300 = await this.securityRepository.findOne({
      where: { code: '000300' },
    });
    if (!index300) {
      index300 = this.securityRepository.create({
        code: '000300',
        name: '沪深300',
        type: SecurityType.INDEX,
        exchange: 'SH',
        status: 1,
      });
      await this.securityRepository.save(index300);
    }
  }

  async index() {
    return await this.securityRepository.find();
  }

  async findBarsById(
    code: string,
    period: BarPeriod,
    startDate: Date,
    endDate: Date,
  ) {
    const security = await this.securityRepository.findOne({
      where: { code },
    });

    if (!security) {
      throw new HttpException(
        `Security ${code} not found`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const bars = await this.barRepository.find({
      relations: ['security'],
      where: {
        security: { id: security.id },
        period,
        timestamp: Between(startDate, endDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });

    return bars.map((bar) => ({
      code: bar.security.code,
      ...bar,
    }));
  }
}
```

- [ ] **Step 2: Commit DataService update**

```bash
git add apps/mist/src/data/data.service.ts
git commit -m "refactor: update DataService to use new entities"
```

---

## Task 12: 更新 Indicator Controller

**Files:**
- Modify: `apps/mist/src/indicator/indicator.controller.ts`

- [ ] **Step 1: Update IndicatorController to use new API**

将所有使用 `dataService.findIndexDailyById` 和 `dataService.findIndexPeriodById` 的地方改为 `dataService.findBarsById`

示例（MACD endpoint）：

```typescript
async macd(@Body() MACDDto: MACDDto): Promise<MACDVo[]> {
  const startDate = this.timezoneService.convertTimestamp2Date(
    MACDDto.startDate,
  );
  const endDate = this.timezoneService.convertTimestamp2Date(MACDDto.endDate);

  let data = [] as any[];

  // 统一使用 findBarsById
  if (MACDDto.daily) {
    data = await this.dataService.findBarsById(
      MACDDto.symbol,
      BarPeriod.DAILY,
      startDate,
      endDate,
    );
  }
  if (MACDDto.period) {
    // 将 period 数字转换为 BarPeriod 枚举
    const periodMap: Record<number, BarPeriod> = {
      5: BarPeriod.MIN_5,
      15: BarPeriod.MIN_15,
      30: BarPeriod.MIN_30,
      60: BarPeriod.MIN_60,
    };
    const period = periodMap[MACDDto.period];
    if (period) {
      data = await this.dataService.findBarsById(
        MACDDto.symbol,
        period,
        startDate,
        endDate,
      );
    }
  }

  const macdResult = await this.indicatorService.runMACD(
    data.map((item) => item.close),
  );

  return data.map((item, index) => ({
    macd: formatIndicator(macdResult.begIndex, index, macdResult.macd),
    signal: formatIndicator(macdResult.begIndex, index, macdResult.signal),
    histogram: formatIndicator(
      macdResult.begIndex,
      index,
      macdResult.histogram,
    ),
    symbol: item.code,
    time: item.timestamp,
    close: item.close,
  }));
}
```

- [ ] **Step 2: Commit IndicatorController update**

```bash
git add apps/mist/src/indicator/indicator.controller.ts
git commit -m "refactor: update IndicatorController to use unified API"
```

---

## Task 13: 删除旧的实体文件

**Files:**
- Delete: `libs/shared-data/src/entities/stock.entity.ts`
- Delete: `libs/shared-data/src/entities/stock-source-format.entity.ts`
- Delete: `libs/shared-data/src/entities/kline.entity.ts`
- Delete: `libs/shared-data/src/entities/kline-extension-ef.entity.ts`
- Delete: `libs/shared-data/src/entities/kline-extension-tdx.entity.ts`
- Delete: `libs/shared-data/src/entities/kline-extension-mqmt.entity.ts`
- Delete: `libs/shared-data/src/entities/index-data.entity.ts`
- Delete: `libs/shared-data/src/entities/index-daily.entity.ts`
- Delete: `libs/shared-data/src/entities/index-period.entity.ts`
- Delete: `libs/shared-data/src/enums/kline-period.enum.ts`
- Delete: `libs/shared-data/src/vo/index.vo.ts`
- Delete: `libs/shared-data/src/vo/index-daily.vo.ts`

- [ ] **Step 1: Delete old entity files**

```bash
cd /Users/xiyugao/code/mist/mist
rm -f libs/shared-data/src/entities/stock.entity.ts
rm -f libs/shared-data/src/entities/stock-source-format.entity.ts
rm -f libs/shared-data/src/entities/kline.entity.ts
rm -f libs/shared-data/src/entities/kline-extension-*.entity.ts
rm -f libs/shared-data/src/entities/index-data.entity.ts
rm -f libs/shared-data/src/entities/index-daily.entity.ts
rm -f libs/shared-data/src/entities/index-period.entity.ts
rm -f libs/shared-data/src/enums/kline-period.enum.ts
rm -f libs/shared-data/src/vo/index.vo.ts
rm -f libs/shared-data/src/vo/index-daily.vo.ts
```

- [ ] **Step 2: Commit deletion of old files**

```bash
git add -A
git commit -m "refactor: remove old entity files"
```

---

## Task 14: 运行迁移并测试

- [ ] **Step 1: Run TypeORM migration**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run migration:run
```

Expected output: Migration executed successfully

- [ ] **Step 2: Verify database schema**

```bash
mysql -u root -p mist -e "SHOW TABLES;"
```

Expected: New tables exist (securities, security_source_configs, market_data_bars, market_data_extensions_ef, etc.)

- [ ] **Step 3: Start application**

```bash
pnpm run start:dev:mist
```

Expected: Application starts without errors

- [ ] **Step 4: Test API endpoints**

```bash
# Test initialization
curl http://localhost:8001/data/index

# Test query bars
curl "http://localhost:8001/market-data/bars?code=000001&period=daily&startDate=2024-01-01&endDate=2024-12-31"
```

Expected: APIs return valid responses

- [ ] **Step 5: Commit final changes**

```bash
git add -A
git commit -m "test: verify migration and API functionality"
```

---

## Verification Checklist

在实施完成后，验证以下内容：

- [ ] 所有新实体已创建并可被 TypeORM 识别
- [ ] 数据库表结构符合设计文档
- [ ] 所有索引和外键约束已创建
- [ ] API 接口可以正常查询数据
- [ ] TypeORM 连接正常，无错误日志
- [ ] 旧实体文件已删除
- [ ] 代码可以正常编译和启动
- [ ] Swagger 文档已更新（如需要）

---

## Rollback Plan

如果实施过程中出现问题：

1. **回滚数据库迁移**：
   ```bash
   pnpm run migration:revert
   ```

2. **回滚代码更改**：
   ```bash
   git reset --hard <previous-commit>
   ```

3. **恢复旧实体文件**（如果需要）：
   ```bash
   git checkout <previous-commit> -- libs/shared-data/src/entities/
   ```

---

## Notes

- 本计划假设开发环境已配置好 MySQL 数据库
- 迁移会删除旧表，确保在测试环境先验证
- 数据采集服务需要单独更新以使用新实体（不在本计划范围）
