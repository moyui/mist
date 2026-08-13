# Design: fixed-point-candle-arithmetic

状态：**待用户逐条确认（D1-D5 决策点）**，确认后展开详细设计。

## D1. 范围（proposal §范围选项）

- S1 / S2 / S3 三档，见 proposal。
- 影响面：S1 仅 `open-candle-aggregator.ts` + 单测；
  S2 加两个 converter + `realtime.types.ts` 契约；
  S3 加策略/backtest/API/落库。

## D2. 定点表示形式

候选：
1. **整数分（cents）**：价格 ×100 为整数（A 股 tick 0.01 对齐）；
   `vwap_cents = round(amount_cents / volume)` 纯整数运算。
   sealed 输出：若存元（2 位小数 number）则 `cents/100`；若存分则整数。
2. **字符串 + 定点工具**：复用 QMT 已有 `Decimal8.parseCanonical`
   （normalize → 规范字符串），计算用定点加/乘/除。
3. **Decimal 库**（decimal.js/big.js）：新增依赖，序列化仍需约定。

倾向：D2 用**整数分**（无新依赖、整数运算可精确、与 DECIMAL(20,2) 对齐），
待确认。

## D3. VWAP 定点计算公式

```
amount_cents = round(Number(amount_string) * 100)   // 一次精确圆整，之后纯整数
vwap_cents   = round(amount_cents / volume)         // 整数除法 + 半值上入
vwap         = vwap_cents / 100                     // 2 位小数（输出语义）
high = max(high, vwap)；low = min(low, vwap)        // 已是 2 位小数
```

要求：round 语义明确（半值远离零或半值上入，二选一，与 MySQL DECIMAL
round 行为对齐——**待确认 ROUND_HALF_UP**）。

## D4. 门禁形态

候选（可组合）：
1. **单测断言**：aggregator 输出每个 o/h/l/c ×100 为整数
   （`Math.abs(v*100 - Math.round(v*100)) < 1e-9`）；
   vwap 精度用例（构造 amount/volume 已知值，断言 2 位精确结果）。
2. **契约 fixture 测试**：converter → aggregator 全链路，断言 sealed
   数值 2 位小数（真实快照格式，如 300502 价量额）。
3. **eslint 规则**：禁止 `amount / volume` 裸除法/`Number()` 转换
   （自定义 rule 或约定 + 评审门禁）——需评估 eslint 能力边界。

## D5. sealed 序列化语义

- 方案 a：Redis JSON 存**元（2 位小数 number）**——消费方零改动，
  门禁保证语义；MySQL 落库照常 DECIMAL。
- 方案 b：Redis JSON 存**整数分**——契约最干净，但策略/backtest/
  查询 API 全部除 100，影响面大（S3 才考虑）。

倾向：sealed 输出保持"元、2 位小数语义"（方案 a），门禁保证；
b 仅当用户选 S3 时讨论。

## 门禁与其他 change 的关系

- `extract-backtest-runtime`：backtest 读 MySQL k（DECIMAL），若 sealed
  定点化后 MySQL 落库一致，backtest 无影响——S3 时才需要联动评审。
- `productize-current-day-realtime-market-data`（已归档）：sealed 语义
  不变（2 位小数），仅内部计算定点化。
