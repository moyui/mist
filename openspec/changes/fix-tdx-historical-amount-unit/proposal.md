# Proposal: fix-tdx-historical-amount-unit

## 背景

2026-08-13 backtest 5.4 隔离 MySQL + 5.5 quantity HIL 前置调查发现：
k 表 `tdx` source 的 historical `amount` 存的是**万元**（raw 原样），而 canonical
契约（extract-backtest-runtime design §765）要求**人民币元**（万元 ×10000）——**差 10000 倍**。

实证（600519 日线，对照真实市场值）：
- `volume = 5512752` = 股 ✓（茅台日成交 551 万股，合理）
- `amount = 737346.25` = 万元（= 73.7 亿元 ✓ 茅台真实日成交额）——**应为 7373462500（元）**

## 现状（链路对比）

| 链路 | 处理 | 单位 |
|---|---|---|
| **实时** TDX snapshot → converter（`readTdxNativeQuantity(input.native, 'Amount', 10_000)`） | ✅ ×10000 | 元（正确） |
| **历史** TDX bars → `TdxSource.saveK`（`normalizeTdxBarQuantity` 原样存） | ❌ 无换算 | 万元（错误） |

只有历史写入层错；实时链路已正确，修复有现成参照（converter 的 ×10000）。

附加事实：TDX 历史 K 拉取端点（`/v1/bars/query`）当前在 datasource 不存在
（retire 时删除），k 表 tdx 4366 bar 是 07-31 前旧链路遗留；未来收盘同步
（sync-post-close-provider-history，未创建）会重建拉取链路——本 change 的换算
契约必须被未来收盘同步复用。

## 目标

- 存量：k 表 tdx 全部 amount 修复为元（4366 bar，×10000）
- 写入层：`normalizeTdxBarQuantity` 对 amount 做 ×10000（volume 保持股原值）
- 契约：TDX amount canonical = 元，与实时链路、QMT（元）、DECIMAL 语义一致
- 未来收盘同步写入链路复用同一换算

## 范围

- k 表存量数据修复（forward-only migration 019 + 验证）
- backend `TdxSource` 写入层换算
- 单测：normalizeTdxBarQuantity amount 换算、migration 前后数据对照

## 非目标

- 不修 QMT（其 amount 已是元）
- 不重建 TDX 历史拉取端点（属未来收盘同步 change）
- 不处理 EF source（不属 Backtest V1）
- 不改变 volume 语义（股原值）
