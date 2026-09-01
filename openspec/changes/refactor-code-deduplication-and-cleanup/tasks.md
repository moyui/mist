# Tasks: refactor-code-deduplication-and-cleanup

## 1. 死代码与过度设计清理
- [x] 1.1 删除 `apps/mist/src/chan/dto/` 下 5 个遗留的旧 Chan CRUD DTOs
- [x] 1.2 删除 `apps/mist/src/chan/chan.service.ts` 中的死方法 `analyze()`
- [x] 1.3 删除 `mist-fe/app/lib/swr/fetcher.ts` 及对应测试（无业务调用的过度设计）
- [x] 1.4 删除 `mist-datasource/src/datasource/tdx_legacy/` 空目录

## 2. 时间与交易日工具收敛 (@app/timezone)
- [x] 2.1 在 `@app/timezone` 中实现并导出 `formatTradingDayString` / `TimezoneService.formatTradingDay`
- [x] 2.2 在 `TimezoneService` 中实现 `resolvePreviousTradingDay`
- [x] 2.3 在 `candle-bucket.util.ts`、`candle-finalizer.ts`、`realtime-market-data-product.service.ts`、`realtime-candle-redis.contract.ts` 中替换为 `@app/timezone`
- [x] 2.4 在 `apps/schedule`（`data-collection.controller.ts`、`pre-market-inspection.service.ts`）中替换为 `@app/timezone` 的 `resolvePreviousTradingDay`

## 3. 缠论力道计算与转换去重
- [x] 3.1 在 `@app/indicators` 中提取公共的 `computeChanUnitForces`，在 `@app/signal` 中导出 `toZhongshu`
- [x] 3.2 改造 `libs/visual-command/src/adapters/chan-visual.adapter.ts` 复用共享计算
- [x] 3.3 改造 `libs/signal/src/runtime/chan-bsp/chan-bsp.pipeline.ts` 复用共享计算

## 4. 控制器样板代码重构
- [x] 4.1 在 `apps/mist/src/chan/chan.controller.ts` 中提取 `getChanKData` 私有方法，精简 6 个端点

## 5. 前端工具统合
- [x] 5.1 在 `mist-fe/app/chan-tests/components/StatsPanel.tsx` 中复用 `formatShanghaiDateTime`
- [x] 5.2 在 `mist-fe/app/dashboard/lib/format.ts` 中复用 `mist-fe/app/lib/time.ts`
- [x] 5.3 统一 `TradingViewChart.tsx` 与 `TradingViewLineChart.tsx` 中的 `toUTCTimestamp`（收敛至 `@/app/lib/time.ts`）

## 6. 验证与回归门禁
- [x] 6.1 运行全量后端单元测试与 TypeScript 编译 (`pnpm run typecheck`, 216/216 test suites passing)
- [x] 6.2 运行前端单元测试与 TypeScript 编译 (`npm run typecheck`, 19/19 test suites, 154/154 tests passing)
- [x] 6.3 运行数据源单元测试 (`pytest`, 554/554 tests passing)

