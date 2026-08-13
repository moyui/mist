# Proposal: fixed-point-candle-arithmetic

## 背景

decouple-bridge-callback-and-correct-vwap-bounds 归档时记录 F1-q（LOW）：
VWAP clamp 用浮点 `amount / volume` → sealed high/low 可能带 sub-cent 精度
（如 1349.4286），与 MySQL `DECIMAL(20,2)` 不一致。当时建议"clamp 前 round 2 位"。

2026-08-13 用户拍板：不止修 F1-q 这一行，要求**系统性门禁**——
candle 链禁止出现浮点数，浮点数一律用大数/定点表示；`amount/volume`
必须用定点计算后再保留 2 位。F2-q（clamp 实时 scope）确认关闭；
F3-q（TDX 重复 fetch）不需要（今晚压力测试再议）；F4-q（TDX 回调
静默吞错）已单独修复。

## 现状（浮点出现层，已盘点）

| 层 | 现状 | 浮点来源 |
|---|---|---|
| converters | `Number()` 转 native → `prices` number | TDX `readTdxNativeNumber` / QMT `optionalFiniteNumber` |
| aggregator | `Number(volumeDelta)`/`Number(amountDelta)` → `amount/volume` 浮点除法 → clamp | `open-candle-aggregator.ts:605-610` |
| sealed | o/h/l/c/v/a number 落 Redis JSON | clamp 后的浮点 |
| 消费 | 策略 scanner / backtest / 查询 API / MySQL `DECIMAL(20,2)` | 读取以上 number |

有利现状：`cumulativeVolume`/`cumulativeAmount` 源头已是 **string**（大数）；
QMT converter 已有 `Decimal8.parseCanonical` 定点工具。缺口在 aggregator
用 `Number()` 打回浮点。

## 目标

candle 全链（converter → aggregator → sealed → 持久化边界）使用定点
语义，禁止浮点中间量；用门禁（测试/契约）保证回归不引入浮点。

## 范围选项（D1，待确认）

- **S1 计算链定点（最小）**：仅 aggregator 的 vwap/clamp 计算定点化
  （整数分运算 + round 2 位），sealed 输出保证 2 位小数语义；门禁覆盖
  aggregator 输出。
- **S2 计算链 + converters 定点契约（中）**：S1 + `prices` 改为定点契约
  （整数分或 Decimal8 规范化输出），converters 内部不再产生裸浮点。
- **S3 全链路定点（最大）**：S2 + 消费方适配（策略 scanner 输入、
  backtest、查询 API、MySQL 落库语义）。

## 非目标

- 不改 TDX/QMT 桥脚本（native 层字符串/原始值已到位）
- 不改变 Redis/MySQL 存储介质本身
- 不处理策略层策略计算逻辑（如指标计算的浮点）——仅保证 candle 数据
  源输入定点化
