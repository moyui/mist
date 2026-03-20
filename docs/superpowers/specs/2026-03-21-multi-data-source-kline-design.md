# 多数据源 K 线数据结构设计

**日期**: 2026-03-21
**作者**: Claude Sonnet 4.6
**状态**: 设计阶段

---

## 1. 背景

当前系统使用 AKTools 获取东方财富的数据，但由于反爬措施导致数据源不稳定。需要接入更多数据源（通达信、miniQMT 等），同时设计通用的数据结构来支持多数据源共存。

### 1.1 问题分析

**不同数据源的代码格式差异**：
- 东方财富：`sz000001` (市场前缀 + 代码)
- 通达信：`000001.SH` (代码 + 市场后缀)
- miniQMT：待确定

**不同数据源的 K 线字段差异**：
- 通用字段：Date/Time, Open, High, Low, Close, Volume, Amount
- 东方财富特有：振幅、涨跌幅、涨跌额、换手率
- 通达信特有：ForwardFactor（前复权因子）

**不同数据源的周期格式差异**：
- 东方财富：`'1'`, `'5'`, `'15'`, `'30'`, `'60'`, `'daily'`, `'weekly'`, `'monthly'`
- 通达信：`'1m'`, `'5m'`, `'1d'` (只原生支持这三种)

### 1.2 设计目标

1. 支持多个数据源同时接入
2. 保留所有数据源的数据（用于对比和容灾）
3. 数据结构清晰、易于扩展
4. 查询性能优化

---

## 2. 数据库设计

### 2.1 表结构概览

```
stocks                    # 股票主表
├── id (PK)
├── code (纯代码，如 000001)
├── name (股票名称)
└── status (状态)

stock_source_formats      # 数据源格式映射表
├── id (PK)
├── stock_id (FK → stocks.id)
├── source (数据源：ef/tdx/mqmt)
├── formatted_code (该数据源的完整格式)
└── UNIQUE(stock_id, source)

k_lines                   # K线主表
├── id (PK)
├── stock_id (FK → stocks.id)
├── source (数据源：ef/tdx/mqmt)
├── period (周期)
├── timestamp (时间戳)
├── open, high, low, close (OHLC)
├── volume, amount (成交量成交额)
└── INDEX(stock_id, source, period, timestamp)

k_line_extensions_ef      # 东方财富扩展表
├── id (PK)
├── k_line_id (FK → k_lines.id, UNIQUE)
├── amplitude (振幅%)
├── change_pct (涨跌幅%)
├── change_amt (涨跌额)
└── turnover_rate (换手率%)

k_line_extensions_tdx     # 通达信扩展表
├── id (PK)
├── k_line_id (FK → k_lines.id, UNIQUE)
└── forward_factor (前复权因子)

k_line_extensions_mqmt    # miniQMT扩展表（待定）
├── id (PK)
├── k_line_id (FK → k_lines.id, UNIQUE)
└── ... (待补充)
```

### 2.2 核心设计原则

1. **纯 code 作为唯一标识**：`000001`，不含市场前缀
2. **数据源格式映射表**：每个数据源的代码格式独立存储
3. **K线主表存储通用数据**：所有数据源共有的 OHLCV
4. **独立扩展表**：每个数据源一张表存储特有字段
5. **保留所有数据源**：通过 `source` 字段区分，可同时查询

---

## 3. TypeORM 实体设计

### 3.1 枚举定义

#### 数据源枚举
```typescript
// libs/shared-data/src/enums/data-source.enum.ts
export enum DataSource {
  EAST_MONEY = 'ef',        // 东方财富
  TDX = 'tdx',              // 通达信
  MINI_QMT = 'mqmt',        // miniQMT
}
```

#### 股票状态枚举
```typescript
// libs/shared-data/src/enums/stock-status.enum.ts
export enum StockStatus {
  NORMAL = 1,               // 正常
  SUSPENDED = 0,            // 停牌
  DELISTED = -1,            // 退市
}
```

#### K线周期枚举
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

### 3.2 周期映射工具

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

### 3.3 实体定义

#### Stock 实体
```typescript
// libs/shared-data/src/entities/stock.entity.ts
@Entity({ name: 'stocks' })
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'tinyint', default: StockStatus.NORMAL })
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

#### StockSourceFormat 实体
```typescript
// libs/shared-data/src/entities/stock-source-format.entity.ts
@Entity({ name: 'stock_source_formats' })
@Unique(['stock', 'source'])
export class StockSourceFormat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({ type: 'varchar', length: 20 })
  source: DataSource;

  @Column({ type: 'varchar', length: 50 })
  formattedCode: string;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
```

#### KLine 实体
```typescript
// libs/shared-data/src/entities/kline.entity.ts
@Entity({ name: 'k_lines' })
@Index(['stock', 'source', 'period', 'timestamp'])
export class KLine {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({ type: 'varchar', length: 20 })
  source: DataSource;

  @Column({ type: 'enum', enum: KLinePeriod })
  period: KLinePeriod;

  @Column({ type: 'datetime' })
  timestamp: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  open: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  high: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  low: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  close: number;

  @Column({ type: 'bigint' })
  volume: string;

  @Column({ type: 'double' })
  amount: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
```

#### KLineExtensionEf 实体
```typescript
// libs/shared-data/src/entities/kline-extension-ef.entity.ts
@Entity({ name: 'k_line_extensions_ef' })
export class KLineExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amplitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  changePct: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  changeAmt: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  turnoverRate: number;
}
```

#### KLineExtensionTdx 实体
```typescript
// libs/shared-data/src/entities/kline-extension-tdx.entity.ts
@Entity({ name: 'k_line_extensions_tdx' })
export class KLineExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true })
  forwardFactor: number;
}
```

---

## 4. 数据流程

### 4.1 初始化股票

```typescript
async initStock(code: string, name: string, sources: DataSource[]) {
  // 1. 创建主表记录
  let stock = await this.stockRepo.findOne({ where: { code } });
  if (!stock) {
    stock = this.stockRepo.create({ code, name });
    await this.stockRepo.save(stock);
  }

  // 2. 为每个数据源创建格式映射
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

formatCode(code: string, source: DataSource): string {
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
```

### 4.2 采集 K 线数据

```typescript
async collectKLine(code: string, period: KLinePeriod, source: DataSource) {
  // 1. 查找股票
  const stock = await this.stockRepo.findOne({ where: { code } });
  if (!stock) throw new Error('股票不存在');

  // 2. 获取格式化代码
  const format = await this.formatRepo.findOne({
    where: { stock: { id: stock.id }, source },
  });
  if (!format) throw new Error('该股票未配置此数据源');

  // 3. 转换周期格式
  const sourcePeriod = PeriodMapping.toSourceFormat(period, source);

  // 4. 用格式化代码采集数据
  const rawData = await this.fetchFromSource(source, format.formattedCode, sourcePeriod);

  // 5. 存储到主表和扩展表
  await this.saveKLineData(stock.id, source, period, rawData);
}
```

### 4.3 查询 K 线数据

```typescript
async queryKLines(code: string, period: KLinePeriod, source?: DataSource) {
  const stock = await this.stockRepo.findOne({ where: { code } });
  if (!stock) throw new Error('股票不存在');

  return this.klineRepo.find({
    relations: ['stock'],
    where: {
      stock: { id: stock.id },
      ...(source && { source }),
      period,
    },
    order: { timestamp: 'ASC' },
  });
}
```

---

## 5. 与现有系统的兼容性

### 5.1 现有实体保留

现有的 `IndexData`、`IndexDaily`、`IndexPeriod` 实体保持不变，用于：
- 向后兼容现有代码
- 指数数据（与股票数据分离）

### 5.2 数据迁移

由于用户选择重新采集数据，无需编写迁移脚本。

---

## 6. 未来扩展

### 6.1 新增数据源

1. 在 `DataSource` 枚举中添加新标识
2. 在 `PERIOD_MAPPING` 中添加周期映射
3. 创建对应的扩展表实体（如有特有字段）
4. 在 `formatCode` 中添加格式化逻辑

### 6.2 新增周期类型

1. 在 `KLinePeriod` 枚举中添加新周期
2. 在各数据源的 `PERIOD_MAPPING` 中添加映射（如支持）

---

## 7. 索引优化

### 7.1 主要查询场景

1. 按股票代码查询：`WHERE stock.code = ?`
2. 按股票+周期查询：`WHERE stock.code = ? AND period = ?`
3. 按股票+数据源查询：`WHERE stock.code = ? AND source = ?`
4. 按时间范围查询：`WHERE timestamp BETWEEN ? AND ?`

### 7.2 推荐索引

```sql
-- k_lines 表
CREATE INDEX idx_kline_lookup ON k_lines(stock_id, source, period, timestamp);

-- stock_source_formats 表
CREATE INDEX idx_format_lookup ON stock_source_formats(stock_id, source);

-- stocks 表
CREATE UNIQUE INDEX idx_stock_code ON stocks(code);
```

---

## 8. 测试计划

### 8.1 单元测试

- [ ] 周期映射工具测试
- [ ] 代码格式化测试
- [ ] 实体关系测试

### 8.2 集成测试

- [ ] 数据采集流程测试
- [ ] 多数据源共存测试
- [ ] 查询性能测试

---

## 9. 实施步骤

1. 创建枚举和工具类
2. 创建 TypeORM 实体
3. 生成数据库迁移
4. 实现数据采集服务
5. 实现查询服务
6. 编写测试
7. 更新 API 接口

---

## 附录

### A. 数据源字段对比表

| 字段 | 东方财富 | 通达信 | miniQMT |
|------|---------|--------|---------|
| 日期 | ✓ | ✓ | ✓ |
| 时间 | ✓ | ✓ | ✓ |
| 开盘价 | ✓ | ✓ | ✓ |
| 最高价 | ✓ | ✓ | ✓ |
| 最低价 | ✓ | ✓ | ✓ |
| 收盘价 | ✓ | ✓ | ✓ |
| 成交量 | ✓ | ✓ | ✓ |
| 成交额 | ✓ | ✓ | ✓ |
| 振幅 | ✓ | ✗ | ? |
| 涨跌幅 | ✓ | ✗ | ? |
| 涨跌额 | ✓ | ✗ | ? |
| 换手率 | ✓ | ✗ | ? |
| 前复权因子 | ✗ | ✓ | ? |

### B. 周期支持对比表

| 周期 | 东方财富 | 通达信 | miniQMT |
|------|---------|--------|---------|
| 1分钟 | ✓ | ✓ | ? |
| 5分钟 | ✓ | ✓ | ? |
| 15分钟 | ✓ | ✗ | ? |
| 30分钟 | ✓ | ✗ | ? |
| 60分钟 | ✓ | ✗ | ? |
| 日线 | ✓ | ✓ | ? |
| 周线 | ✓ | ✗ | ? |
| 月线 | ✓ | ✗ | ? |
| 季线 | ✗ | ✗ | ? |
| 年线 | ✗ | ✗ | ? |
