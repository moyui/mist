# Strategy 模块与背离检测设计文档

**日期**: 2026-03-20
**作者**: moyui + Claude
**状态**: 设计完成，待实现

---

## 📋 概述

本文档描述了 Mist 项目中 Strategy 模块的设计和实现方案，用于检测股票市场中的背离和背驰信号。

**目标**: 创建一个完整的策略分析引擎，支持 MACD 背离检测（价格背离 + 力度背离），并预留缠论背驰检测接口。

---

## 🎯 核心需求

### 功能需求

1. **MACD 价格背离检测**
   - 比较相邻两笔同向笔的末端价格
   - 比较对应位置的 MACD 黄白线值
   - 顶背离：价格新高 + MACD 未新高 → 卖出信号
   - 底背离：价格新低 + MACD 未新低 → 买入信号

2. **MACD 力度背离检测**
   - 计算每笔区间的 MACD 红绿柱面积（分方向累加）
   - 比较两笔的面积比率
   - 面积比率 < 0.8 → 力度减弱 → 背离信号

3. **缠论背驰检测（预留）**
   - 当前抛出 NOT_IMPLEMENTED 异常
   - 预留接口和 VO 结构

### 接口需求

- **时间段检测**: `POST /strategy/divergence/check` - 检测指定时间段内的所有背离
- **最近检测**: `GET /strategy/divergence/recent` - 检测最近的 N 笔背离
- **缠论背驰**: `POST /strategy/divergence/chan` - 预留接口

---

## 🏗️ 架构设计

### 模块结构

```
apps/mist/src/strategy/
├── strategy.controller.ts       # HTTP 控制器
├── strategy.service.ts          # 主服务（协调器）
├── strategy.module.ts           # 模块定义
├── dto/                         # 请求 DTO
│   ├── check-divergence.dto.ts
│   └── check-recent.dto.ts
├── vo/                          # 响应 VO
│   ├── divergence.vo.ts
│   └── divergence-list.vo.ts
├── strategies/                  # 策略实现
│   ├── macd-divergence.strategy.ts
│   └── chan-divergence.strategy.ts
└── enums/                       # 枚举
    ├── divergence-type.enum.ts
    ├── divergence-direction.enum.ts
    └── suggestion.enum.ts
```

### 模块依赖

```typescript
@Module({
  imports: [
    DataModule,        // 获取 K 线数据
    IndicatorModule,   // 计算 MACD
    ChanModule,        // 获取笔和中枢数据
  ],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    MACDDivergenceStrategy,
    ChanDivergenceStrategy,
  ],
  exports: [StrategyService],
})
export class StrategyModule {}
```

---

## 📦 数据模型

### DTO

#### CheckDivergenceDto

```typescript
export class CheckDivergenceDto {
  @IsString()
  @IsNotEmpty({ message: '股票代码不能为空' })
  symbol: string;

  @IsInt({ message: '周期必须是整数' })
  @IsIn([1, 5, 15, 30, 60], { message: '周期必须是 1, 5, 15, 30, 60 之一' })
  @IsNotEmpty({ message: '周期不能为空' })
  period: PeriodType;

  @IsInt({ message: '开始日期必须是13位时间戳' })
  @IsNotEmpty({ message: '开始日期不能为空' })
  startDate: number;

  @IsInt({ message: '结束日期必须是13位时间戳' })
  @IsNotEmpty({ message: '结束日期不能为空' })
  endDate: number;

  @IsOptional()
  @IsEnum(['price', 'strength', 'both'])
  divergenceType?: 'price' | 'strength' | 'both';
}
```

#### CheckRecentDto

```typescript
export class CheckRecentDto {
  @IsString()
  @IsNotEmpty({ message: '股票代码不能为空' })
  symbol: string;

  @IsInt({ message: '周期必须是整数' })
  @IsIn([1, 5, 15, 30, 60], { message: '周期必须是 1, 5, 15, 30, 60 之一' })
  @IsNotEmpty({ message: '周期不能为空' })
  period: PeriodType;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '回溯笔数至少为 1' })
  @Max(100, { message: '回溯笔数最多为 100' })
  lookback?: number;
}
```

### VO

#### DivergenceVo

```typescript
export class DivergenceVo {
  hasDivergence!: boolean;
  divergenceType!: 'macd_price' | 'macd_strength';
  type!: 'top' | 'bottom';
  strength!: number;  // 价格背离: MACD 变化百分比 | 力度背离: 面积比率

  bi1!: {
    biId!: number;
    endTime!: Date;
    price!: number;
    macd!: number;
    area!: number;
  };

  bi2!: {
    biId!: number;
    endTime!: Date;
    price!: number;
    macd!: number;
    area!: number;
  };

  suggestion!: 'buy' | 'sell' | 'hold';
  details!: string;
  time!: Date;
}
```

#### DivergenceListVo

```typescript
export class DivergenceListVo {
  divergences!: DivergenceVo[];
  total!: number;
  buySignals!: number;
  sellSignals!: number;
  symbol!: string;
  period!: PeriodType;
}
```

---

## 🔧 核心算法

### 1. 价格背离检测

**输入**: 两笔同向笔 (bi1, bi2)、MACD 数据、K 线数据

**算法**:
1. **找到两笔末端在 K 线数据中的索引**：
   - 使用 `bi.originData` 获取笔包含的所有 K 线
   - 找到最后一根 K 线的 `id` 字段作为索引
   - K 线 ID 与 MACD 数组索引的关系：`macdIndex = klineId - macdResult.begIndex`

2. **获取对应的 MACD 值**：
   ```typescript
   const macdIndex = klineId - macdResult.begIndex;
   if (macdIndex < 0 || macdIndex >= macdData.length) {
     return null; // MACD 数据不可用
   }
   const macdValue = macdData[macdIndex];
   ```

3. **比较价格和 MACD 变化**：
   - 上升笔：检查顶背离（价格新高 + MACD 未新高）
   - 下降笔：检查底背离（价格新低 + MACD 未新低）

4. **计算强度**（改进为百分比）：
   ```typescript
   // 价格变化百分比
   const priceChange = Math.abs((price2 - price1) / price1);
   // MACD 变化百分比
   const macdChange = Math.abs((macd2 - macd1) / macd1);
   // 强度 = MACD 变化 / 价格变化
   strength = macdChange / priceChange;
   ```

**输出**: `DivergenceVo | null`

**关键点**：
- 只比较 `BiStatus.Valid` 且 `BiType.Complete` 的笔
- 跳过方向不同的笔对
- 处理 MACD `begIndex` 偏移

---

### 2. 力度背离检测

**输入**: 两笔同向笔 (bi1, bi2)、Histogram 数据、K 线数据

**算法**:
1. 找到两笔的起止 K 线索引
2. 计算每笔区间的 MACD 柱子面积（分方向累加）：
   ```typescript
   for (let i = startIndex; i <= endIndex; i++) {
     if (histogram[i] > 0) upArea += histogram[i];
     else downArea += Math.abs(histogram[i]);
   }
   totalArea = upArea + downArea;
   ```
3. 比较面积比率：`ratio = area2.totalArea / area1.totalArea`
4. 判断：`ratio < 0.8` → 力度减弱 → 背离

**输出**: `DivergenceVo | null`

---

### 3. Bi 迭代逻辑

**关键理解**: 背离检测比较的是**同向笔对**。由于笔是交替的（上-下-上-下-...），同向笔之间间隔一笔。

**迭代规则**:
```typescript
// 过滤有效笔
const validBis = biData.filter(bi =>
  bi.status === BiStatus.Valid &&
  bi.type === BiType.Complete
);

// 比较 bi[0]&bi[2], bi[1]&bi[3], bi[2]&bi[4], ...
for (let i = 0; i < validBis.length - 2; i++) {
  const bi1 = validBis[i];      // 当前笔
  const bi2 = validBis[i + 2];  // 下一根同向笔

  // 确认方向相同
  if (bi1.direction !== bi2.direction) {
    continue; // 跳过，不应该发生（笔是交替的）
  }

  // 执行背离检测
  const priceDiv = detectPriceDivergence(bi1, bi2, ...);
  const strengthDiv = detectStrengthDivergence(bi1, bi2, ...);

  // ...
}
```

**示例**:
```
笔序列: [上1, 下1, 上2, 下2, 上3, 下3]
比较对: (上1, 上2), (下1, 下2), (上2, 上3), (下2, 下3)
```

**注意事项**:
- 跳过 `BiStatus.Invalid` 的笔
- 只比较 `BiType.Complete` 的完整笔
- 方向不同的笔对不应该出现（笔的理论特性）

### 4. 数据流程

```
HTTP Request
    ↓
StrategyController (参数验证)
    ↓
StrategyService (协调器)
    ├→ DataService.getKLineData()
├→ IndicatorService.calculateMACD()
└→ BiService.getBiData()
    ↓
MACDDivergenceStrategy (算法实现)
├→ detectPriceDivergence()
└→ detectStrengthDivergence()
    ↓
DivergenceVo (统一格式)
    ↓
HTTP Response
```

---

## ⚠️ 错误处理

### 错误码定义

```typescript
// Business Error Codes (2xxx)
enum StrategyErrorCode {
  INSUFFICIENT_BI_DATA = 2001,        // 笔数据不足（少于 2 笔）
  NO_KLINE_DATA = 2002,               // K 线数据不存在
  INVALID_DATE_RANGE = 2003,          // 时间范围无效
  BI_DATA_INCOMPLETE = 2004,          // 笔数据不完整
  MACD_INDEX_OUT_OF_BOUNDS = 2005,    // MACD 索引越界
  ZERO_AREA_CANNOT_DETECT = 2006,     // 面积为零无法检测力度背离

  // Feature Not Implemented (5xxx)
  CHAN_DIVERGENCE_NOT_IMPLEMENTED = 5001,  // 缠论背驰未实现
}
```

### HTTP 状态码映射

| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| 2001 | 400 | 笔数据不足，无法进行背离检测 |
| 2002 | 404 | 未找到对应股票和周期的 K 线数据 |
| 2003 | 400 | 开始日期 >= 结束日期 |
| 2004 | 400 | 笔数据不完整（缺少 originData） |
| 2005 | 500 | MACD 索引超出范围（数据异常） |
| 2006 | 400 | 某笔的 MACD 柱子全为零，无法计算力度 |
| 5001 | 501 | 缠论背驰功能尚未实现 |

### 错误响应示例

**笔数据不足**:
```json
{
  "success": false,
  "code": 2001,
  "message": "笔数据不足，至少需要 2 笔才能进行背离检测",
  "timestamp": "2026-03-20T10:30:00.000Z",
  "requestId": "err-1710899800000-abc123"
}
```

**K 线数据不存在**:
```json
{
  "success": false,
  "code": 2002,
  "message": "未找到股票 sh.000001 在 5 分钟周期的 K 线数据",
  "timestamp": "2026-03-20T10:30:00.000Z",
  "requestId": "err-1710899800000-def456"
}
```

**缠论背驰未实现**:
```json
{
  "success": false,
  "code": 5001,
  "message": "缠论背驰检测功能开发中，敬请期待",
  "timestamp": "2026-03-20T10:30:00.000Z",
  "requestId": "err-1710899800000-ghi789"
}
```

### 异常处理策略

**数据验证错误**（在 Controller 层）:
- 使用 `class-validator` 自动验证 DTO
- 抛出 `BadRequestException`，自动转换为 1xxx 错误码

**业务逻辑错误**（在 Service 层）:
- 抛出带有具体错误码的 `HttpException`
- 利用现有的 `AllExceptionsFilter` 统一处理

**计算错误**（在 Strategy 层）:
- 索引越界、方向不一致 → 返回 `null`，跳过该笔对
- 不抛出异常，在循环中优雅处理

---

## 🧪 测试策略

### 单元测试

**测试文件**: `strategies/*.strategy.spec.ts`

**覆盖内容**:
- 价格背离检测（顶背离、底背离、无背离）
- 力度背离检测（力度减弱、无力度减弱）
- 面积计算（分方向累加、全零情况）
- 边界条件（空数据、索引越界）

### 集成测试

**测试文件**: `strategy.service.spec.ts`

**覆盖内容**:
- 完整的检测流程（获取数据 → 计算指标 → 检测背离）
- Service 间调用
- 错误处理流程

### E2E 测试

**测试文件**: `test/strategy.e2e-spec.ts`

**覆盖内容**:
- HTTP 接口调用
- 响应格式验证
- 错误状态码验证

---

## 📚 API 文档

### POST /strategy/divergence/check

检测指定时间段内的所有 MACD 背离信号。

**请求体**:
```json
{
  "symbol": "sh.000001",
  "period": 5,
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-12-31T23:59:59.999Z",
  "divergenceType": "both"
}
```

**响应**:
```json
{
  "divergences": [...],
  "total": 5,
  "buySignals": 3,
  "sellSignals": 2,
  "symbol": "sh.000001",
  "period": 5
}
```

---

### GET /strategy/divergence/recent

检测最近的 N 笔中的 MACD 背离信号。

**查询参数**:
- `symbol`: 股票代码（必需）
- `period`: 周期（必需）
- `lookback`: 回溯笔数（可选，默认 10）

**响应**: 同上

---

### POST /strategy/divergence/chan

检测缠论背驰（预留接口）。

**响应**:
```json
{
  "success": false,
  "code": 5001,
  "message": "缠论背驰检测功能开发中，敬请期待",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## ⚡ 性能优化

### 数据查询优化

- 只查询必要的字段（select）
- 使用索引（period + dataTable + completed）

### 批量处理

- 使用 `Promise.all` 并行获取 K 线数据和笔数据
- 避免串行查询导致的性能问题

### 缓存预留

- 预留 `@Cacheable` 装饰器接口
- 未来可以缓存 MACD 计算结果（5 分钟 TTL）

---

## 🔮 未来扩展

### 短期扩展

1. **Redis 缓存**: 缓存 MACD 计算结果和笔数据
2. **WebSocket 实时推送**: 检测到背离时实时推送
3. **信号历史记录**: 保存背离信号到数据库

### 中期扩展

1. **缠论背驰实现**: 完整的缠论背驰检测算法
2. **多周期共振**: 同时检测多个周期的背离信号
3. **自定义阈值**: 让用户配置背离强度阈值

### 长期扩展

1. **回测模块**: 验证背离信号的准确性
2. **信号评分**: 综合多个指标给出评分
3. **机器学习**: 使用 ML 优化背离检测算法

---

## ✅ 实施计划

### Phase 1: 基础功能（1-2天）

1. 创建 Strategy 模块结构
2. 实现 DTO 和 VO
3. 实现 StrategyService 基础框架
4. 注册到 AppModule

### Phase 2: MACD 背离检测（2-3天）

1. 实现 MACDDivergenceStrategy
2. 实现价格背离检测算法
3. 实现力度背离检测算法
4. 编写单元测试

### Phase 3: 接口和测试（1-2天）

1. 实现 StrategyController
2. 添加 Swagger 文档
3. 编写集成测试
4. 编写 E2E 测试

### Phase 4: 优化和文档（1天）

1. 性能优化
2. 错误处理完善
3. 补充文档
4. Code review

---

## 📝 注意事项

1. **代码风格**: 保持与现有模块一致（使用 `!` 断言、class-validator 等）
2. **依赖注入**: 使用 Service 注入，而不是 HTTP 调用
3. **错误处理**: 统一使用 HttpException，利用现有的 ExceptionFilter
4. **测试覆盖**: 核心算法必须有单元测试
5. **文档**: 所有接口必须有 Swagger 文档

---

## 🔗 相关文档

- [项目开发指南](../CLAUDE.md)
- [缠论分析模块](../apps/mist/src/chan/README.md)
- [技术指标模块](../apps/mist/src/indicator/README.md)
