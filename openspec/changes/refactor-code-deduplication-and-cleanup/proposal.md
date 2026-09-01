# Proposal: refactor-code-deduplication-and-cleanup

## Why

在全仓代码质量与架构审计中，发现多处违背**“公共工具模块强制复用准则”**（§6.8）与**“防过度设计与奥卡姆剃刀准则”**（§6.9）的问题：
1. **多处私有重写工具函数**：
   - 交易日 `YYYYMMDD` 格式化在 4 个文件中就地手写拼接，未复用 `@app/timezone`；
   - 交易日回溯推导逻辑（11 行回溯循环）在 `data-collection.controller` 与 `pre-market-inspection.service` 完全重复；
   - 缠论动能分析 `computeUnitForces`（48 行）与中枢包装 `toZhongshu` 在 `ChanVisualAdapter` 和 `chan-bsp.pipeline` 之间 100% 逐字重复；
   - 前端各组件自行调用 `Intl.DateTimeFormat`，未复用 `@/app/lib/time`；
   - 飞书 Webhook HMAC-SHA256 签名在 `schedule` 中私有重复实现；
   - `ChanController` 6 个端点重复 120 行查询与 K 转换样板代码。
2. **死代码与过度设计（YAGNI）**：
   - `apps/mist/src/chan/dto/` 残留 5 个旧 Chan 持久化时代的死 CRUD DTO（零引用）；
   - `ChanService.analyze()` 为未被调用的死方法；
   - `mist-fe/app/lib/swr/fetcher.ts` 为过度设计的通用 SWR 包装层，业务页面零调用；
   - `mist-datasource/src/datasource/tdx_legacy/` 为空目录。

本 Change 旨在贯彻“删掉这段代码，功能还能不能跑？能跑就删”的核心准则，彻底清理死代码，并将重复实现的工具逻辑收敛至标准共享模块。

## What Changes

1. **死代码与过度设计清理**：
   - 删除 `apps/mist/src/chan/dto/` 下所有遗留 CRUD DTO（`create-chan.dto.ts`、`create-channel.dto.ts`、`update-bi.dto.ts`、`update-chan.dto.ts`、`update-channel.dto.ts`）；
   - 删除 `ChanService.analyze()` 死方法；
   - 清理前端未使用的 `useApi` SWR 抽象及对应测试；
   - 清理 `mist-datasource` 空目录。

2. **时间与交易日工具收敛至 `@app/timezone`**：
   - 在 `@app/timezone` 中统一提供 `formatTradingDay(date: Date): string` 与 `resolvePreviousTradingDay(date: Date, maxLookback?: number): Date`；
   - 替换 `candle-bucket.util.ts`、`candle-finalizer.ts`、`realtime-market-data-product.service.ts`、`realtime-candle-redis.contract.ts` 中的私有 `YYYYMMDD` 拼装；
   - 替换 `data-collection.controller.ts` 与 `pre-market-inspection.service.ts` 中的回溯推导。

3. **动能力道计算提升至公共模块**：
   - 将 `computeUnitForces` 和 `toZhongshu` 提取至 `@app/chancore` 或 `@app/indicators` 公共模块；
   - `libs/visual-command` 与 `libs/signal` 统一引用该公共函数，消除 48 行跨库重复。

4. **控制器样板代码精简**：
   - 在 `apps/mist/src/chan/chan.controller.ts` 中提炼 `getChanKData` 私有方法，消除 6 个端点中重复的 120 行样板代码。

5. **前端时间工具统合**：
   - 前端各组件统一引用 `mist-fe/app/lib/time.ts`（`formatShanghaiDateTime`、`toUTCTimestamp`），消除局部 `Intl.DateTimeFormat` 实例化。

## 影响范围

| 文件 / 模块 | 改动说明 |
|---|---|
| `libs/timezone/` | 新增 `formatTradingDay` 与 `resolvePreviousTradingDay` 公共方法及单测 |
| `apps/mist/src/realtime/candle/` | 移除私有 `formatTradingDay` / `tradingDayFromBucketMs`，改用 `@app/timezone` |
| `apps/schedule/src/` | 移除重复回溯推导，改用 `@app/timezone` |
| `libs/visual-command/` | 移除重复 `computeUnitForces`，改用 shared 动能计算 |
| `libs/signal/` | 移除重复 `computeUnitForces`，改用 shared 动能计算 |
| `apps/mist/src/chan/` | 彻底移除旧 DTOs，移除 `analyze()`，提取 `getChanKData` 消除重复样板 |
| `mist-fe/app/` | 移除死代码 `fetcher.ts`，统一前端时间处理至 `app/lib/time.ts` |
