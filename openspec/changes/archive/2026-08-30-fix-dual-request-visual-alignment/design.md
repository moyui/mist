# Design: 双请求可视化对齐修复

## 1. 现状架构（双请求已落地）

```
FE: KLineLivePage / BacktestWorkspace
  ├─ fetchK(query) ────────────── POST /v1/indicators/k        (IndicatorController)
  │                                  └─ TimezoneService.parseDateString
  │                                     └─ IndicatorService.findKData ── Between(start,end) ── MySQL K
  └─ fetchVisualCommands(query) ── GET  /v1/visual/commands     (VisualController)
                                     └─ TimezoneService.parseDateString
                                        └─ IndicatorService.findKData ── Between(start,end) ── MySQL K
                                           └─ slice(-count=500)          ← 待移除
                                           └─ projectToChanK (KPriceProjector strict) ── filter(null) ← 待对齐
                                              └─ ChanVisualAdapter.convert ── getKIndex → 0 回退 ← 待修复
                                                 └─ VisualCommand[]
FE 合并: TradingViewChart { k, commands }  ← 时间轴错位即源于上游三处分叉
```

## 2. 目标架构（Spec 约束后）

```
FE 以同一 query {code, period, source, startDate, endDate} 并发双请求
  - startDate/endDate 必须携带时分秒精度（不再 substring(0,10) 截断）
  - 可选 time 精度对齐由 app/lib/time.ts 统一提供

BE 两端点共享同一查询真源
  - 相同的 TimezoneService.parseDateString 语义（YYYY-MM-DD → 00:00:00+08:00 等价）
  - 相同的 IndicatorService.findKData WHERE/ORDER BY 契约
  - 移除 count 默认裁剪；如需分页由显式参数另行设计，不在本变更引入

价格投射一致
  - K 端点与 Visual 端点对 DECIMAL 的校验/转换策略一致
  - 任何不可投射的 bar 不得静默丢弃而不被观测；Spec 约束丢弃可观测性（日志/指标/契约字段三选一，具体在实施计划定）

索引映射零伪造
  - ChanVisualAdapter.getKIndex 未命中 → null → 丢弃该 command，禁止回退 0
  - VisualCommandVo 与 visual-command.types.ts 单一来源对齐，补齐 fromIndex/toIndex/fromTime/toTime/gg/dd 等缺失字段
```

## 3. 核心不变量（Spec 将固化）

1. **同参同源**：对同一 query，双端点的 SQL 语义等价。
2. **同窗同序**：`Between(start,end)` 均含边界，`ORDER BY timestamp ASC`。
3. **零伪造**：未命中索引不回退 0；VO 字段与 types 对齐。
4. **可观测丢弃**：任一不可投射/不可映射的过滤必须可观测，不静默。

## 4. 不做事项
- 不合并为单聚合接口；不引入 Redis 缓存；不修改 chancore 算法。

## 5. 风险与回滚
- 移除 `count=500` 后，大窗口（数千根）下 `libs/visual-command` 的 `ChanCore.createBi/createChannels` 计算量上升，但仍在单次请求可接受范围（历史区间查询本就受 DB 限制）；如需限流，后续以显式 `limit` 参数另行设计。
- 回滚：任一端点异常可独立回滚，双请求互为降级（K 正常则蜡烛仍可见）。
