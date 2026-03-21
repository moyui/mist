# 统一数据表架构设计文档

**目标**：重构数据表架构，统一股票和指数数据，支持多数据源，规范命名，提升扩展性。

**设计原则**：
- 数据库表名和字段名使用 `snake_case`
- TypeScript 实体类名使用 `PascalCase`
- TypeScript 属性名使用 `camelCase`
- TypeORM 自动处理命名转换
- 统一股票和指数为 Securities（证券）
- 统一日线和分钟线为 MarketDataBars（市场数据K线）

---

## 架构概览

```
securities (证券主表)
  ├─ id
  ├─ code (纯代码: 000001, 000300)
  ├─ name (名称: 平安银行, 上证指数)
  ├─ type (证券类型: STOCK/INDEX)
  ├─ exchange (交易所: SH/SZ/CSI)
  ├─ status (状态: ACTIVE/SUSPENDED/DELAISTED)
  └─ security_source_configs (数据源配置)
      └─ 1:N 关系

security_source_configs (数据源配置表)
  ├─ security_id (关联证券)
  ├─ source (数据源: ef/tdx/mqmt)
  ├─ format_code (数据源特定代码)
  ├─ priority (优先级)
  └─ enabled (是否启用)

market_data_bars (统一K线数据表)
  ├─ id
  ├─ security_id (关联证券)
  ├─ source (数据源: ef/tdx/mqmt)
  ├─ period (周期: 1min/5min/15min/30min/60min/daily)
  ├─ timestamp (时间戳)
  ├─ open, high, low, close, volume, amount
  └─ 扩展表 (通过 OneToOne 关联)
      ├─ market_data_extensions_ef (source='ef' 时)
      ├─ market_data_extensions_tdx (source='tdx' 时)
      └─ market_data_extensions_mqmt (source='mqmt' 时)
```

---

## 表结构设计

### 1. Securities（证券主表）

**数据库表名**：`securities`

**用途**：统一存储股票和指数的基础信息

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK | 主键 | id: number |
| code | VARCHAR(20) UK | 纯代码 (000001, 000300) | code: string |
| name | VARCHAR(100) | 名称 (平安银行, 上证指数) | name: string |
| type | ENUM | 证券类型 (STOCK/INDEX) | type: SecurityType |
| exchange | VARCHAR(10) | 交易所 (SH/SZ/CSI) | exchange: string |
| status | TINYINT DEFAULT 1 | 状态 (1=正常, 0=停牌, -1=退市) | status: SecurityStatus |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |
| updated_at | DATETIME(6) | 更新时间 | updatedAt: Date |

**索引**：
- UNIQUE KEY `UNIQ_code` (`code`)
- INDEX `IDX_type` (`type`)
- INDEX `IDX_exchange` (`exchange`)
- INDEX `IDX_status` (`status`)

**TypeORM 实体**：

```typescript
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

**枚举定义**：

```typescript
// 证券类型
export enum SecurityType {
  STOCK = 'STOCK',   // 股票
  INDEX = 'INDEX',   // 指数
}

// 证券状态
export enum SecurityStatus {
  DELISTED = -1,  // 退市/终止运行
  SUSPENDED = 0,  // 停牌
  ACTIVE = 1,     // 正常/活跃
}
```

---

### 2. SecuritySourceConfigs（数据源配置表）

**数据库表名**：`security_source_configs`

**用途**：配置每个证券在不同数据源下的代码格式和优先级

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK | 主键 | id: number |
| security_id | INT FK | 关联 securities.id | securityId: number |
| source | ENUM | 数据源 (ef/tdx/mqmt) | source: DataSource |
| format_code | VARCHAR(50) | 数据源特定代码 | formatCode: string |
| priority | INT DEFAULT 0 | 优先级 (数字越大越优先) | priority: number |
| enabled | BOOLEAN DEFAULT true | 是否启用 | enabled: boolean |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |
| updated_at | DATETIME(6) | 更新时间 | updatedAt: Date |

**索引**：
- INDEX `IDX_security_id` (`security_id`)
- UNIQUE KEY `UNIQ_security_source` (`security_id`, `source`)
- INDEX `IDX_priority` (`priority`)

**TypeORM 实体**：

```typescript
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

---

### 3. MarketDataBars（统一K线数据表）

**数据库表名**：`market_data_bars`

**用途**：统一存储所有证券的K线数据（日线 + 分钟线）

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK | 主键 | id: number |
| security_id | INT FK | 关联 securities.id | securityId: number |
| source | ENUM | 数据源 (ef/tdx/mqmt) | source: DataSource |
| period | ENUM | 周期 (1min/5min/15min/30min/60min/daily) | period: BarPeriod |
| timestamp | DATETIME | 时间戳 | timestamp: Date |
| open | DECIMAL(12,2) | 开盘价 | open: number |
| high | DECIMAL(12,2) | 最高价 | high: number |
| low | DECIMAL(12,2) | 最低价 | low: number |
| close | DECIMAL(12,2) | 收盘价 | close: number |
| volume | BIGINT | 成交量 (手) | volume: bigint |
| amount | DOUBLE | 成交额 (元) | amount: number |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |

**索引**：
- INDEX `IDX_security_id` (`security_id`)
- INDEX `IDX_source` (`source`)
- INDEX `IDX_period` (`period`)
- INDEX `IDX_timestamp` (`timestamp`)
- UNIQUE KEY `UNIQ_bar` (`security_id`, `source`, `period`, `timestamp`)
- INDEX `IDX_security_period_time` (`security_id`, `period`, `timestamp`)

**TypeORM 实体**：

```typescript
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
  @JoinColumn({ name: 'id' })
  extensionEf: MarketDataExtensionEf;

  @OneToOne(() => MarketDataExtensionTdx, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' })
  extensionTdx: MarketDataExtensionTdx;

  @OneToOne(() => MarketDataExtensionMqmt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id' })
  extensionMqmt: MarketDataExtensionMqmt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

**枚举定义**：

```typescript
// K线周期
export enum BarPeriod {
  MIN_1 = '1min',
  MIN_5 = '5min',
  MIN_15 = '15min',
  MIN_30 = '30min',
  MIN_60 = '60min',
  DAILY = 'daily',
}

// 数据源
export enum DataSource {
  EAST_MONEY = 'ef',      // 东方财富
  TDX = 'tdx',            // 通达信
  MINI_QMT = 'mqmt',      // miniQMT
}
```

---

### 4. MarketDataExtensionEf（东方财富扩展表）

**数据库表名**：`market_data_extensions_ef`

**用途**：存储东方财富数据源的特有字段

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK FK | 关联 market_data_bars.id | id: number |
| amplitude | DECIMAL(10,2) NULL | 振幅 (%) | amplitude: number |
| change_pct | DECIMAL(10,2) NULL | 涨跌幅 (%) | changePct: number |
| change_amt | DECIMAL(10,2) NULL | 涨跌额 (元) | changeAmt: number |
| turnover_rate | DECIMAL(10,2) NULL | 换手率 (%) | turnoverRate: number |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |

**索引**：
- UNIQUE KEY `UNIQ_id` (`id`)

**TypeORM 实体**：

```typescript
@Entity({ name: 'market_data_extensions_ef' })
export class MarketDataExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionEf, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id' })
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

---

### 5. MarketDataExtensionTdx（通达信扩展表）

**数据库表名**：`market_data_extensions_tdx`

**用途**：存储通达信数据源的特有字段

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK FK | 关联 market_data_bars.id | id: number |
| forward_factor | DECIMAL(12,6) NULL | 前复权因子 | forwardFactor: number |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |

**索引**：
- UNIQUE KEY `UNIQ_id` (`id`)

**TypeORM 实体**：

```typescript
@Entity({ name: 'market_data_extensions_tdx' })
export class MarketDataExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionTdx, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id' })
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

---

### 6. MarketDataExtensionMqmt（miniQMT扩展表）

**数据库表名**：`market_data_extensions_mqmt`

**用途**：存储 miniQMT 数据源的特有字段

**字段设计**：

| 字段名 | 类型 | 说明 | TypeScript 属性 |
|--------|------|------|----------------|
| id | INT PK FK | 关联 market_data_bars.id | id: number |
| created_at | DATETIME(6) | 创建时间 | createdAt: Date |

**注**：当前为占位表，待补充 miniQMT 特有字段

**索引**：
- UNIQUE KEY `UNIQ_id` (`id`)

**TypeORM 实体**：

```typescript
@Entity({ name: 'market_data_extensions_mqmt' })
export class MarketDataExtensionMqmt {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, (bar) => bar.extensionMqmt, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id' })
  marketDataBar: MarketDataBar;

  // TODO: 待补充 miniQMT 特有字段

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

---

## 数据库迁移脚本

### 迁移步骤

1. **创建新表结构**
2. **迁移现有数据**
   - Stocks → Securities (type='STOCK')
   - IndexData → Securities (type='INDEX')
   - KLines → MarketDataBars
   - IndexDailys/IndexPeriods → MarketDataBars
3. **更新外键关联**
4. **删除旧表**

### SQL 示例

```sql
-- 1. 创建 securities 表
CREATE TABLE `securities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL COMMENT '纯代码',
  `name` varchar(100) NOT NULL COMMENT '证券名称',
  `type` enum('STOCK','INDEX') NOT NULL COMMENT '证券类型',
  `exchange` varchar(10) NOT NULL COMMENT '交易所',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UNIQ_code` (`code`),
  KEY `IDX_type` (`type`),
  KEY `IDX_exchange` (`exchange`),
  KEY `IDX_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 迁移 stocks 数据
INSERT INTO `securities` (`code`, `name`, `type`, `exchange`, `status`, `created_at`, `updated_at`)
SELECT
  `code`,
  `name`,
  'STOCK' as `type`,
  CASE
    WHEN `code` LIKE '6%' THEN 'SH'
    WHEN `code` LIKE '0%' OR `code` LIKE '3%' THEN 'SZ'
    ELSE 'UNKNOWN'
  END as `exchange`,
  `status`,
  `create_time`,
  `update_time`
FROM `stocks`;

-- 3. 迁移 index_data 数据
INSERT INTO `securities` (`code`, `name`, `type`, `exchange`, `status`, `created_at`, `updated_at`)
SELECT
  `symbol` as `code`,
  `name`,
  'INDEX' as `type`,
  UPPER(`code`) as `exchange`,
  1 as `status`,
  `create_time`,
  `update_time`
FROM `index_datas`;

-- ... 其他表的迁移脚本
```

---

## API 接口变更

### 查询接口统一

**旧接口**：
```
GET /data/index-daily?symbol=000001&startDate=xxx&endDate=xxx
GET /data/index-period?symbol=000001&period=5&startDate=xxx&endDate=xxx
POST /indicator/k (使用 IndexVo)
```

**新接口**：
```
GET /market-data/bars?code=000001&period=daily&startDate=xxx&endDate=xxx
GET /market-data/bars?code=000001&period=5min&startDate=xxx&endDate=xxx
POST /indicator/k (使用 MarketDataBarVo)
```

### 统一响应格式

```typescript
// MarketDataBarVo
interface MarketDataBarVo {
  id: number;
  code: string;
  name: string;
  type: 'STOCK' | 'INDEX';
  source: 'ef' | 'tdx' | 'mqmt';
  period: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily';
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

---

## 文件结构

```
libs/shared-data/src/
├── entities/
│   ├── security.entity.ts              # 证券主表
│   ├── security-source-config.entity.ts # 数据源配置
│   ├── market-data-bar.entity.ts       # K线主表
│   ├── market-data-extension-ef.entity.ts  # EF扩展
│   ├── market-data-extension-tdx.entity.ts # TDX扩展
│   └── market-data-extension-mqmt.entity.ts # MQMT扩展
├── enums/
│   ├── security-type.enum.ts           # 证券类型
│   ├── security-status.enum.ts         # 证券状态
│   ├── data-source.enum.ts             # 数据源
│   └── bar-period.enum.ts              # K线周期
├── dto/
│   ├── query-market-data.dto.ts        # 查询DTO
│   └── save-market-data.dto.ts         # 保存DTO
├── vo/
│   └── market-data-bar.vo.ts           # 返回VO
└── migrations/
    └── 2026-03-21-unified-schema.ts    # 迁移脚本
```

---

## 优势总结

✅ **统一架构**：股票和指数使用同一套表结构
✅ **规范命名**：数据库 snake_case，代码 PascalCase/camelCase
✅ **灵活扩展**：通过枚举和扩展表支持新类型和新数据源
✅ **查询高效**：合理的索引设计，支持多维度查询
✅ **类型安全**：TypeORM 提供完整的 TypeScript 类型支持
✅ **易于维护**：清晰的表结构，减少代码重复
