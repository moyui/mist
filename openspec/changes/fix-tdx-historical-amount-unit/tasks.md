# Tasks: fix-tdx-historical-amount-unit

日期：2026-08-13
状态：proposed（**待 D1-D4 逐条确认**）

## 1. 决策确认（当前步骤，完成后展开）

- [ ] D1 存量修复：migration 019（forward-only UPDATE ×10000）确认
- [ ] D2 写入层换算：normalizeTdxBarQuantity 加 fieldName + amount ×10000（Decimal8 scaleByUnit）确认
- [ ] D3 边界：消费者清单确认（backtest quantity plan ineligible 期间无影响；未来收盘同步复用）
- [ ] D4 验证：单测 + 隔离 MySQL + 生产 600519 对照

## 2. 实施（D 确认后展开）

（占位）

## 3. 验证

（占位）
