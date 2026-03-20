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

  @IsNotEmpty({ message: '周期不能为空' })
  period: PeriodType;

  @IsNotEmpty({ message: '开始日期不能为空' })
  startDate: Date;

  @IsNotEmpty({ message: '结束日期不能为空' })
  endDate: Date;

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
  strength!: number;

  bi1!: {
    price: number;
    macd: number;
    area: number;
  };

  bi2!: {
    price: number;
    macd: number;
    area: number;
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
1. 找到两笔末端在 K 线数据中的索引
2. 获取对应的 MACD 值（DIF 线）
3. 比较价格和 MACD 变化：
   - 上升笔：检查顶背离（价格新高 + MACD 未新高）
   - 下降笔：检查底背离（价格新低 + MACD 未新低）
4. 计算强度：`strength = |ΔMACD| / |ΔPrice|`

**输出**: `DivergenceVo | null`

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

### 3. 数据流程

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

### 数据验证错误

- **时间范围无效**: 开始日期 >= 结束日期 → 400 Bad Request
- **K 线数据为空**: 未找到对应股票和周期的数据 → 404 Not Found
- **笔数据不足**: 少于 2 笔 → 400 Bad Request

### 计算错误

- **索引越界**: K 线索引或 MACD 索引超出范围 → 返回 null，跳过该笔
- **方向不一致**: 两笔方向不同 → 跳过比较
- **MACD 数据缺失**: 无法获取对应值 → 返回 null

### HTTP 异常

利用现有的 `AllExceptionsFilter` 统一处理和返回格式。

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
