# Design: fix-tdx-historical-amount-unit

状态：**待用户逐条确认（D1-D4）**，确认后展开实施计划。

## D1. 存量修复方式

候选：
1. **forward-only migration 019**：`UPDATE k SET amount = amount * 10000 WHERE source='tdx' AND amount IS NOT NULL`——与现有 migration 机制一致（run-migrations 顺序执行 + ledger），回滚语义明确（forward-only，不设计反向）。
2. backfill 脚本（独立执行）——无 ledger，易漏。
3. 应用层一次性修复任务——运行时修复，依赖 schedule。

倾向：**1（migration 019）**，待确认。

注意：migration 019 必须先于 backtest cutover（5.6）执行——否则 backtest 读到万元。

## D2. 写入层换算位置

`normalizeTdxBarQuantity`（`tdx-source.service.ts:342`）当前同时处理 volume/amount（都原样
normalize）。换算方案：
- volume：保持股原值（不换算）
- amount：`×10000`（万元→元），用 Decimal8 定点乘（`scaleByUnit(10000)` 语义，
  复用 fixed-point 契约，不经 JavaScript 浮点）

调用处区分字段：`normalizeTdxBarQuantity(bar.volume, 'volume')` /
`normalizeTdxBarQuantity(bar.amount, 'amount')`——签名加 field 参数，或拆两个函数。
倾向：签名加 fieldName（与 `normalizeEastMoneyQuantity(value, fieldName)` 风格一致）。

## D3. 边界与影响面

- **实时链路不受影响**（converter 已正确，另一条路径）
- **backtest**：quantity plan 当前 ineligible（5.5 未证明 profile 前不启用量额规则）——
  修复后 profile 证明（5.5）→ eligible 时读到的是正确元值
- **其他消费者**：搜代码确认读 k.amount 的地方（策略扫描读实时 Redis candle；
  历史 K 消费者 = backtest + 可能的展示查询）——实施计划里列出完整清单
- **未来收盘同步**：spec 注明换算契约归属（写入层统一 ×10000），sync-post-close
  创建时复用

## D4. 验证

- 单测：normalizeTdxBarQuantity amount ×10000（600519 737346.25 → 7373462500）、
  volume 不变、null 透传
- migration 019 在隔离 MySQL 验证（复用 5.4 的隔离流程：preflight 万元 → apply →
  postflight 元）+ 生产 apply 前备份（或先隔离验证再生产）
- 生产 apply 后：600519 日线 amount 对照真实值（73.7 亿）
- 存量验证：k 表 tdx amount 全量 ×10000 后与真实值抽查

## 与其他 change 的关系

- `extract-backtest-runtime`：5.5 quantity HIL 的 TDX amount profile 依赖本 change
  （证明 canonical 元前 profile 无法 approved）——本 change 是 5.5 的前置
- 未来 `sync-post-close-provider-history`：复用写入层换算契约
