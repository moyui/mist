# Tasks: fixed-point-candle-arithmetic

日期：2026-08-13
状态：completed（实施完成，本地 commit 未 push，随下次部署）

## 1. 决策确认（2026-08-13 用户确认）

- [x] D1 范围：**S2**（aggregator + converters 契约门禁）
- [x] D2 定点表示：**整数分（Decimal8 BigInt scale-8，复用现有类）**
- [x] D3 vwap round 语义：**ROUND_HALF_UP**（divideRoundHalfUp 公式 `(n*2+d)/(2*d)`）
- [x] D4 门禁：**①单测断言（×100 整数不变式）+ ②契约 fixture 全链路**（eslint 规则未选）
- [x] D5 sealed 序列化：**元（2 位小数 number 语义）**，出口统一 round 2 位

## 2. 实施

- [x] 2.1 `libs/decimal/src/decimal8.ts`：+ `divideRoundHalfUp(other)`（除数必须 >0，ROUND_HALF_UP）+ `roundToScale(places)`（0-8 位，半值上入，越界抛 RangeError）
- [x] 2.2 `open-candle-aggregator.ts` `toSealed`：vwap 改 Decimal8 定点链
      （`amount.divideRoundHalfUp(volume).roundToScale(2)` → Number 唯一显式转换）；
      出口 o/h/l/c 统一 `round(v*100)/100`（2 位小数语义，`v*100` 整数）
- [x] 2.3 `decimal8.spec.ts`：除法精度（13560000/10000、13494000/10000、5371394900/12126800=442.93588581、1/8、1/3）、
      零除抛错、roundToScale 2/0/8 位 + 越界（-1/9/1.5）
- [x] 2.4 `open-candle-aggregator.spec.ts`：现有 4 用例断言不变（1356/1349.4/1355/null）+ 新增
      sub-cent 精度回归（5371394900/12126800 → 442.94）+ 3 位输入 round + ×100 整数不变式
- [x] 2.5 新 `fixed-point-candle-contract.spec.ts`（S2 门禁）：真实 fixture 全链路
      （TDX 600030 / QMT 300502 → decoder → converter → aggregator → freeze）断言
      数值 2 位不变式 + string 量额透传 + clamp Decimal8 精确值（TDX ×100/×10000 单位、
      QMT volume 手→股 ×100、timetag eventTime）

## 3. 验证

- [x] 3.1 定点相关单测：4 套件 98/98（decimal 66 + aggregator 28 + contract 4）
- [x] 3.2 lint + typecheck 通过
- [x] 3.3 `npm run test:ci`：1323 passed（2 suites / 3 tests skipped，基线不变）
- [x] 3.4 `npm run test:coverage`：gate 通过（Statements 82.6%）
- [x] 3.5 `openspec validate fixed-point-candle-arithmetic --strict` 通过
- [x] 3.6 本地 commit 未 push（与 QMT 死锁 e04a1c8 + F4 a3506b1 同批，下次部署一起上）

## 4. 已知取舍（spec 记录）

- 北交所 3 位价格：sealed 出口统一 2 位会 round——当前未订阅，接入时重评
- 消费方（策略/backtest/API）仍读 number——D5=a 语义不变，S3 推迟
