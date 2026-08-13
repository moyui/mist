# Tasks: fix-tdx-historical-amount-unit

日期：2026-08-13
状态：completed（已部署 87f37d22，migration 019 生产 apply + 数据验证通过）

## 1. 决策确认（2026-08-13 用户确认）

- [x] D1 存量修复：**migration 019**（forward-only `UPDATE k SET amount=amount*10000 WHERE source='tdx' AND amount IS NOT NULL`）
- [x] D2 写入层换算：`normalizeTdxBarQuantity(value, fieldName)` + amount `Decimal8.scaleByUnit(10000)`（定点，无浮点）；volume 股原值不变
- [x] D3 边界：实时链路已正确（converter ×10000）不受影响；backtest quantity plan ineligible 期间无运行时影响；未来收盘同步复用换算契约（spec 记录）
- [x] D4 验证：单测 + 隔离 mysql:8.4 + 生产 600519 对照（73.7 亿）

## 2. 实施

- [x] 2.1 `tdx-source.service.ts`：import Decimal8 + `normalizeTdxBarQuantity(value, fieldName)` + 调用处（L131-132）
- [x] 2.2 `deploy/database/migrations/019_fix_tdx_historical_amount_yuan.sql`（新文件，forward-only UPDATE）
- [x] 2.3 `tdx-source.service.spec.ts`：映射测试更新（`12345.6`→`123456000`）+ 600519 真实值用例（`737346.25`→`7373462500`）+ volume 不变 + null 透传

## 3. 验证

- [x] 3.1 tdx-source spec 20/20 + lint + typecheck
- [x] 3.2 `npm run test:ci`：1350 passed
- [x] 3.3 隔离 mysql:8.4：001-018 → 插样本（tdx 万元 + qmt 对照 + null）→ apply 019 → tdx ×10000 精确、qmt/null/volume 不动
- [x] 3.4 `openspec validate fix-tdx-historical-amount-unit --strict`
- [x] 3.5 生产部署（87f37d22，run 31698493068 success）：ledger 19 条 + 600519 amount=7373462500（73.7 亿）✓

## 4. 备注

- 第一次部署 pull 404 = GHCR 索引同步延迟（Build 12:01 完成、pull 12:03）——重试即成功
- 本 change 是 backtest 5.5 quantity HIL 的 TDX amount profile 前置（canonical 元证明）
- 未来 sync-post-close-provider-history 创建时复用写入层换算契约
