# 实施计划：fixed-point-candle-arithmetic（定点化 candle 计算链）

> 依据 spec 已确认决策：D1=S2（aggregator + converters 契约）、D2=整数分
> （Decimal8 BigInt 定点）、D3=ROUND_HALF_UP、D4=①单测断言+②契约 fixture、
> D5=a（sealed 输出元、2 位小数 number 语义）。
> 状态：**待用户确认后落地**。落地批次：与 QMT 死锁修复（datasource e04a1c8）、
> F4 TDX 桥诊断（a3506b1）同批，本地 commit 不 push，等下次部署。

## 核心认知（已核实）

1. `QuantityState.delta`（volume/amount delta）**已是 string**，且用 Decimal8
   定点类计算（`currentValue.subtract(precedingValue).formatCanonical()`）——
   浮点化的唯一缺口在 `toSealed` 的 `Number(state.volumeDelta)` + `amount / volume`。
2. `libs/decimal/src/decimal8.ts` Decimal8 已有：`parseCanonical` /
   `formatCanonical` / `add` / `subtract` / `compare` / `scaleByUnit(100)`
   （BigInt scale-8 定点）——**缺除法与 round**。
3. converters（TDX/QMT）现状已是"native 字符串 → number 一次转换"（无算术），
   S2 的实质是加**契约门禁**（fixture 全链路断言），非改造代码。
4. A 股沪深价格为 2 位小数（tick 0.01）；北交所 3 位**未订阅**——
   sealed 出口统一 round 2 位，契约注明北交所接入时重评（已知取舍）。

## 改动文件与具体形态

### 1. `libs/decimal/src/decimal8.ts` — Decimal8 加两个方法

```ts
/**
 * Divide by another Decimal8, rounding half up to scale-8.
 * Non-negative operands only (Decimal8 is unsigned by design).
 */
divideRoundHalfUp(other: Decimal8): Decimal8 {
  assertDecimal8(other);
  if (other.scaledValue <= 0n) {
    throw new RangeError('division requires a positive Decimal8 divisor');
  }
  const numerator = this.scaledValue * DECIMAL8_SCALE;
  const denominator = other.scaledValue;
  const rounded = (numerator * 2n + denominator) / (2n * denominator); // ROUND_HALF_UP
  return Decimal8.fromScaled(rounded);
}

/**
 * Round to `places` decimal places (0..8), half up. Non-negative only.
 */
roundToScale(places: number): Decimal8 {
  if (!Number.isInteger(places) || places < 0 || places > 8) {
    throw new RangeError('places must be an integer in 0..8');
  }
  const factor = 10n ** BigInt(8 - places);
  const half = factor / 2n;
  const rounded = ((this.scaledValue + half) / factor) * factor;
  return Decimal8.fromScaled(rounded);
}
```

- `divideRoundHalfUp` 公式 `(n*2+d)/(2*d)` 对正数 = ROUND_HALF_UP（已验证：
  `13560000/10000 → 1356.00000000`、`13494000/10000 → 1349.40000000`）
- 现有 `decimal-boundary.guard.spec.ts` 的 range 门禁（DECIMAL(36,8)）自动覆盖
  新方法（fromScaled 检查）

### 2. `apps/mist/src/realtime/candle/open-candle-aggregator.ts` — `toSealed` 定点化

替换 L605-611 的浮点 vwap：

```ts
if (state.volumeDelta && state.amountDelta) {
  const volume = Decimal8.parseCanonical(state.volumeDelta);
  const amount = Decimal8.parseCanonical(state.amountDelta);
  if (volume.compare(Decimal8.ZERO) > 0 && amount.compare(Decimal8.ZERO) > 0) {
    // Fixed-point VWAP: amount / volume in Decimal8 (BigInt, scale-8),
    // rounded to 2 decimal places (cents) before crossing to number.
    // No binary-float intermediate arithmetic (F1-q gate).
    const vwapCents = amount.divideRoundHalfUp(volume).roundToScale(2);
    const vwap = Number(vwapCents.formatCanonical());
    high = Math.max(high, vwap);
    low = Math.min(low, vwap);
  }
}
```

出口统一 2 位小数（D5=a + 门禁不变式）：

```ts
// Fixed-point output contract: every sealed numeric field is 2-decimal
// (cents-exact). 北交所 3 位精度接入时重评（spec 记录）。
const toCents = (v: number): number => Math.round(v * 100) / 100;
// return 块内：open: toCents(state.open), high: toCents(high),
// low: toCents(low), close: toCents(state.close)
```

- 现有 4 个 VWAP 用例断言不变（1356 / 1349.4 / 1355+1350 / null+0）
- `Math.round(v*100)/100` 是**唯一显式浮点圆整**（结果 ×100 为整数），
  门禁断言该不变式

### 3. `libs/decimal/src/decimal8.spec.ts` — 新用例

- `divideRoundHalfUp`：整除（13560000/10000=1356.00000000）、
  有限小数（13494000/10000=1349.40000000）、半值上入（1/8 → 0.12500000 精确）、
  三值精度（5371394900/12126800 → 442.95120xxx，断言 formatCanonical 精确串）、
  零除抛 RangeError、除数必须 >0
- `roundToScale`：2 位（1349.42860000 → 1349.43000000 上入）、
  0 位（round 到整数）、8 位恒等、places 越界（-1/9/1.5）抛 RangeError

### 4. `apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts` — 新用例

- `it('seals VWAP with fixed-point sub-cent precision (F1-q regression)')`：
  makeState({ volumeDelta: '12126800', amountDelta: '5371394900' }) →
  断言 `sealed.high` 等于定点期望（amount/volume 用 Decimal8 算）且
  `abs(v*100 - round(v*100)) < 1e-9`
- `it('seals every numeric field to 2-decimal fixed point')`：
  high=1349.432（3 位输入）→ sealed.high = 1349.43；遍历 sealed 的
  open/high/low/close 断言 ×100 整数不变式
- `it('preserves unchanged band when VWAP inside (existing)')` 等 4 用例保留

### 5. 契约 fixture 门禁（S2）— 新文件 `apps/mist/src/realtime/candle/fixed-point-candle-contract.spec.ts`

复用 `realtime-native-map.decoder.fixture.spec.ts` 的真实 native 快照
（TDX 300502.SZ：`Now/Price "447.95"`、`Volume/Amount` 字符串；QMT 同），
走 decoder → converter → aggregator.applySnapshot ×N → toSealed：

- 断言 sealed 每个数值字段 ×100 整数（2 位不变式）
- 断言 vwap 期望值 = `Decimal8` 独立计算（测试内自算）一致
- 断言 `cumulativeVolume/cumulativeAmount` 保持 string 透传（无浮点化）

## 验证命令

```bash
# mist 仓库（主 worktree）
npm run lint && npm run typecheck          # 门禁
npx jest apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts \
  apps/mist/src/realtime/candle/fixed-point-candle-contract.spec.ts \
  libs/decimal  --runInBand                # 定点相关单测
npm run test:ci                            # 全量（--forceExit，基线）
npm run test:coverage                      # 覆盖率门禁（基线 82.72%）
openspec validate fixed-point-candle-arithmetic --strict   # change 校验
```

## 不做（记录）

- 策略 scanner / backtest / 查询 API 消费适配（S3，backtest 5.6 cutover 时联动）
- eslint 自定义规则（D4 未选③）
- 桥脚本（native 层不动）
- 北交所 3 位精度（契约注明，接入时重评）

## 提交形态

- mist 主 worktree：单 commit（decimal8 + aggregator + 测试），本地不 push
- change 目录文件随 commit 一起（tasks 勾选 + validate）
