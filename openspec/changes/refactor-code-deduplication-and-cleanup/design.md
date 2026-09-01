# Design: refactor-code-deduplication-and-cleanup

## 1. 架构与治理原则

本设计严格遵循项目质量治理规范中的两项核心准则：
- **§6.8 工具与公共模块强制复用准则**：单一职责能力必须具备全局唯一真源，杜绝任何形式的就地复制或私有重复造轮子。
- **§6.9 防过度设计与奥卡姆剃刀准则**：以“删掉这段代码，功能还能不能跑？能跑就删”为判定闸门，坚决消除投机性抽象、死 DTO 与未引用的空壳层。

---

## 2. 详细设计方案

### 2.1 时区与时间工具收敛 (`@app/timezone`)

1. **`formatTradingDay` / `tradingDayFromBucketMs` 统一**：
   在 `libs/timezone/src/timezone.service.ts` 及纯函数 `timezone.util.ts` 中导出：
   ```typescript
   export function formatTradingDayString(date: Date): string {
     const zoned = toShanghaiDate(date);
     const yyyy = zoned.getFullYear().toString().padStart(4, '0');
     const mm = (zoned.getMonth() + 1).toString().padStart(2, '0');
     const dd = zoned.getDate().toString().padStart(2, '0');
     return `${yyyy}${mm}${dd}`;
   }
   ```
   并在 `TimezoneService` 中暴露实例方法 `formatTradingDay(date: Date): string`。
   下游消费者（`candle-bucket.util.ts`、`candle-finalizer.ts`、`realtime-market-data-product.service.ts`、`realtime-candle-redis.contract.ts`）直接引用该实现。

2. **`resolvePreviousTradingDay` 公共化**：
   在 `TimezoneService` 中增加公共方法：
   ```typescript
   resolvePreviousTradingDay(date: Date, maxLookbackDays = 10): Date {
     for (let i = 1; i <= maxLookbackDays; i++) {
       const candidate = subDays(date, i);
       if (this.isTradingDay(candidate)) {
         return candidate;
       }
     }
     throw new Error(`Failed to resolve previous trading day within ${maxLookbackDays} days from ${date.toISOString()}`);
   }
   ```
   消除 `apps/schedule` 内部 `data-collection.controller.ts` 与 `pre-market-inspection.service.ts` 的重复实现。

---

### 2.2 缠论力道计算共享 (`@app/indicators` / `@app/chancore`)

1. **`computeUnitForces` 动能分析提取**：
   当前 `libs/visual-command/src/adapters/chan-visual.adapter.ts` 与 `libs/signal/src/runtime/chan-bsp/chan-bsp.pipeline.ts` 各自包含一套完全相同的 `computeUnitForces` 实现（使用 MACD 柱面积与 DIF 极值）。
   将其提取至 `@app/indicators` 或 `@app/signal` 公共 helper：
   ```typescript
   export function computeChanUnitForces(
     klines: readonly ChanK[],
     units: readonly ChanBspUnit[],
   ): readonly ChanUnitForce[];
   ```
2. **`toZhongshu` 转换提取**：
   将 `ChanChannel | ChanDuanChannel` 到 `ChanDivergenceZhongshu` 的结构投影提升为共享转换器。

---

### 2.3 控制器样板代码精简 (`apps/mist/src/chan/chan.controller.ts`)

在 `ChanController` 中引入统一的私有数据提取管道：
```typescript
private async getChanKData(queryDto: IndicatorQueryDto): Promise<ChanK[]> {
  const { startDate, endDate } = this.parseQueryDateRange(queryDto);
  const rawKs = await this.indicatorService.findKData({
    code: queryDto.code,
    period: queryDto.period,
    startDate,
    endDate,
    source: queryDto.source,
  });
  return rawKs.map((k) => ({
    id: k.id,
    symbol: k.security.code,
    time: k.timestamp,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    amount: k.amount,
  }));
}
```
6 个端点统一简化为一行：`const kData = await this.getChanKData(queryDto); return this.chanService.xxx({ k: kData });`。

---

### 2.4 前端与死代码彻底清理

1. **移除死 DTOs**：已清理 `apps/mist/src/chan/dto/create-chan.dto.ts` 等 5 个文件。
2. **移除 `ChanService.analyze()`**：已清理无调用的包装方法。
3. **移除 `mist-fe/app/lib/swr/fetcher.ts`**：删除未被页面使用的通用 SWR 包装层。
4. **统一前端时间格式化**：全部收敛至 `@/app/lib/time`。
