# 实施计划：fix-tdx-historical-amount-unit（TDX 历史 amount 万元→元）

> spec 已确认（D1=migration 019、D2=写入层 ×10000、D3=边界、D4=验证）。
> 状态：**待用户确认后落地**。落地批次：mist 仓本地 commit → 部署时 migration 019 自动
> apply（mist-migrate 容器）——**必须先于 backtest cutover（5.6）**。

## 核心认知（已核实）

1. TDX 历史 amount 原生单位 = **万元**（k 表 600519 `737346.25` 万元 = 73.7 亿元 ✓ 真实
   成交额；若为"元"则 73.7 万，茅台日成交不可能——反证成立）
2. 实时链路已正确（converter `readTdxNativeQuantity(..., 'Amount', 10_000)` ×10000）
3. 历史链路错在 `normalizeTdxBarQuantity`（L342）**原样存**
4. k 表 volume = 股原值 ✓（5512752 股，不换算）
5. `Decimal8` 可从 `@app/decimal` import（与 normalizeExternalDecimalText 同源）

## 改动文件与具体形态

### 1. `apps/mist/src/sources/tdx/tdx-source.service.ts`

import 加 Decimal8：

```ts
import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
```

normalize 函数改造（L342）：

```ts
function normalizeTdxBarQuantity(
  value: string | null,
  fieldName: 'volume' | 'amount',
): string | null {
  if (value === null) return null;
  const normalized = normalizeExternalDecimalText(value);
  if (fieldName === 'amount') {
    // TDX historical amount is provider-native 万元; canonical is yuan.
    // Exact fixed-point ×10000 (Decimal8), no binary-float arithmetic.
    return Decimal8.parseCanonical(normalized)
      .scaleByUnit(10_000)
      .formatCanonical();
  }
  return normalized;
}
```

调用处（L131-132）：

```ts
volume: normalizeTdxBarQuantity(bar.volume, 'volume'),
amount: normalizeTdxBarQuantity(bar.amount, 'amount'),
```

### 2. `deploy/database/migrations/019_fix_tdx_historical_amount_yuan.sql`（新文件）

```sql
-- Fix TDX historical amount unit: provider-native 万元 → canonical yuan.
-- 2026-08-13 backtest quantity HIL finding: k.amount for source='tdx' stores
-- 万元 raw (600519 737346.25 = 73.7亿元). Realtime converter already converts
-- ×10000; the historical write path did not. Forward-only data repair;
-- volume (shares) is untouched. Must apply before backtest cutover (5.6).
UPDATE `k`
  SET `amount` = `amount` * 10000
  WHERE `source` = 'tdx' AND `amount` IS NOT NULL;
```

范围检查：`decimal(36,8)`——737346.25000000 × 10000 = 7373462500.00000000
（10 位整数，远在 28 位上限内）✓

### 3. `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`

- 更新 'fetchK posts to /v1/bars/query and maps normalized bars'：
  `amount: '12345.6'` → **`amount: '123456000'`**（×10000，mock 12345.6 万元）
  volume 期望不变（'1200.125'，股原值）
- 新增用例：`amount: '737346.25'` → `'7373462500'`（600519 真实值对照）
- 新增用例：amount null 透传（`{ amount: null }` → `amount: null`）
- 检查 'rejects signed amount'（'+12345.6' 仍 reject——normalizeExternalDecimalText
  拒绝 + 前缀，不冲突）✓

### 4. 隔离 MySQL 验证（复用 5.4 流程）

1. 起 mysql:8.4 容器 + 跑 001-018（完整 schema）
2. 插入 TDX 样本（600519 日线 737346.25 / 元组对比）
3. apply 019 → 验证 `amount = 7373462500`（×10000 精确）
4. 验证 volume 不变、null 行不动、ef/qmt source 不动

### 5. 生产 apply

- 随下次部署（mist-migrate 容器自动跑 019，ledger 记录）
- 部署后验证：600519 日线 amount ≈ 73.7 亿（对照真实值）
- **backtest cutover（5.6）之前必须完成**

## 验证命令

```bash
# mist 仓
npm run lint && npm run typecheck
npx jest apps/mist/src/sources/tdx/tdx-source.service.spec.ts --runInBand
npm run test:ci          # 全量（--forceExit）
openspec validate fix-tdx-historical-amount-unit --strict
# 隔离 MySQL（复用 5.4 流程脚本化）
```

## 不做（记录）

- QMT amount（已是元，不动）
- TDX 历史拉取端点重建（未来 sync-post-close change）
- volume 单位（股原值，不动）
- EF source（不属 Backtest V1）
