# 实施计划 — extract-shared-indicators-library（三步工作流第 2 步）

> 依据：`openspec/changes/extract-shared-indicators-library/`（四件套，validate 72/72，用户 08-14 已确认）。
> 本文档为代码落地级计划；**确认后才建 worktree 写代码**。

## 0. 范围一句话

把指标数学从 `IndicatorService`（API）与 `libs/strategy`（回测+实时）两套平行实现中抽为
`libs/indicators`（`@app/indicators`）纯库：6 个 Series 函数 + 2 个 Observation 函数 +
`computeUnitForces` + 2 个错误类；API 改薄转换层（**唯一行为变更 = KDJ 参数 14→9**）；
策略层委派 Observation；`technicalindicators` import 收敛到库内一处；全程零 DB/部署/migration。

## 1. 交付物与文件级改动清单

### Phase A — 建库注册（照 `libs/chancore` 模板，4 个配置点 + 库骨架）

| 文件 | 改动 |
|------|------|
| `nest-cli.json` | projects 增加 `indicators`：`{type:"library", root:"libs/indicators", entryFile:"index", sourceRoot:"libs/indicators/src", compilerOptions:{tsConfigPath:"libs/indicators/tsconfig.lib.json"}}` |
| `tsconfig.json` | `compilerOptions.paths["@app/indicators"] = ["libs/indicators/src/index.ts"]`（精确映射，无 `@app/indicators/*`——守卫断言） |
| `package.json` | `jest.moduleNameMapper["^@app/indicators$"] = "<rootDir>/libs/indicators/src/index.ts"`（精确匹配，照 `^@app/chancore$` 风格） |
| `libs/indicators/tsconfig.lib.json` | 新文件，照 `libs/chancore/tsconfig.lib.json`（extends ../../tsconfig.json；declaration；outDir ../../dist/libs/indicators；include src/**/*；exclude node_modules/dist/test/\*\*/*spec.ts） |

`libs/*` 无需改 `build:docker`（nest build 编译 app 时连带编译依赖的 libs，chancore 无独立 build 入口，同例）。

### Phase B — core 实现（新库文件）

建议文件布局（扁平按指标聚合；参照 chancore 纯函数风格）：

```
libs/indicators/src/
  index.ts        # barrel：全部函数 + 类型 + 错误类（不导出 internal 细节）
  errors.ts       # IndicatorInputError / IndicatorValueError
  macd.ts         # computeMacdSeries / computeMacdObservation + MacdSeriesResult / MacdObservation
  kdj.ts          # computeKdjSeries / computeKdjObservation + KdjSeriesResult / KdjObservation
  rsi.ts          # computeRsiSeries + RsiSeriesResult
  adx.ts          # computeAdxSeries  + AdxSeriesResult
  atr.ts          # computeAtrSeries  + AtrSeriesResult
  dual-ma.ts      # computeDualMaSeries + DualMaSeriesResult
  force.ts        # computeUnitForces
  indicators-boundary.guard.spec.ts   # 纯净守卫 + 注册断言 + technicalindicators 收敛守卫
  macd.spec.ts / kdj.spec.ts / force.spec.ts 等    # 各函数单测
```

关键签名（与 design §3.6 一致）：

```ts
// macd.ts（固定 12/26/9 EMA，无参数）
export interface MacdSeriesResult { begIndex: number; macd: number[]; signal: number[]; histogram: number[]; }
export interface MacdObservation { line: number; signal: number; histogram: number; }
export function computeMacdSeries(closes: readonly number[]): MacdSeriesResult;
export function computeMacdObservation(closes: readonly number[], opts?: { windowSize?: number }): MacdObservation;

// kdj.ts（默认 9,3,3，params 可选覆写）
export interface KdjSeriesResult { begIndex: number; K: number[]; D: number[]; J: number[]; }
export interface KdjObservation { k: number; d: number; j: number; }
export function computeKdjSeries(high, low, close: readonly number[], params?: { period?; kSmoothing?; dSmoothing? }): KdjSeriesResult;
export function computeKdjObservation(high, low, close: readonly number[], opts?: { windowSize?: number }): KdjObservation;

// rsi.ts / adx.ts / atr.ts / dual-ma.ts
export function computeRsiSeries(closes: readonly number[], period?: number): RsiSeriesResult;   // 默认 14
export function computeAdxSeries(high, low, close, period?: number): AdxSeriesResult;           // 默认 14
export function computeAtrSeries(high, low, close, period?: number): AtrSeriesResult;           // 默认 14
export function computeDualMaSeries(closes, params?: {shortPeriod?; longPeriod?}): DualMaSeriesResult; // 13/60

// force.ts（背驰专用）
export function computeUnitForces(histogram: readonly number[], begIndex: number, kTimes: readonly Date[], units: readonly {startTime: Date; endTime: Date}[]): number[];

// errors.ts
export class IndicatorInputError extends Error { name = 'IndicatorInputError'; }   // windowSize 不匹配/参数非法
export class IndicatorValueError extends Error { name = 'IndicatorValueError'; }   // Observation 末位非有限
```

实现要点：
- 每个 series 函数 = **readonly 入参 → `[...values]` 拷贝 → technicalindicators 调用 → 复刻现实现过滤/对齐**（对齐规则见 design §3.2 表：MACD 滤完整值、KDJ 滤有限 d 后 SMA/对齐、其余直取）；
- 空输入/不足 warmup：返回空数组 + `begIndex = 输入长度`，不抛错；
- Observation = 同一 series 计算 → 取末位：`opts.windowSize` 传了且长度不匹配 → `IndicatorInputError`；末位非有限 → `IndicatorValueError`；不传 windowSize 则只做末位有限校验；
- 不内置 130/13 常量（catalog 数值在 strategy 层），不 import 任何 `@app/*` / Nest / typeorm。

### Phase C — core 单测

- 每个 series 函数：**golden 夹具逐值断言**（夹具来源 = 落地时先用现 `indicator.service.spec.ts` 的既有断言值冻结：MACD 80 根 → begIndex 33 / length 47 / `macd[0]≈4.010272`、signal/histogram 同；KDJ 以 (9,3,3) 新输出为准）；
- Observation：`computeMacdObservation(...) === 末位(computeMacdSeries(...))` 不变量（多组输入）；`windowSize` 匹配/不匹配（抛 IndicatorInputError）；短输入末位非有限（抛 IndicatorValueError）；
- 确定性与不变异（入参数组深拷贝前后对比）；空输入/不足 warmup 行为；
- `force.spec.ts`：区间面积和、begIndex 截断、边界单元、空区间 → 0。

### Phase D — API 薄转换层（`apps/mist/src/indicator/`，不做设计，纯转换）

| 文件 | 改动 |
|------|------|
| `indicator.service.ts` | 移除 `import { ADX, ATR, MACD, RSI, SMA, Stochastic } from 'technicalindicators'` 及私有 `begIndex/isFiniteNumber/isCompleteMacdValue`（逻辑已入 core）；六方法改为委托（见下）；`findKData` 纹丝不动 |
| `indicator.controller.ts` | 仅一处：runKDJ 输入构造里的 `period: 14` 移除（改 9 或不设，让 runKDJ 走默认）——**KDJ 参数修复落点**；其余不动（formatIndicator / 端点 / throttle / VO 全保持） |
| `indicator.service.spec.ts` | MACD/RSI/ADX/ATR/DualMA 用例**保持全绿**（输出逐值不变）；**KDJ 用例改写**：`(14,3,3)` 断言（begIndex 17 / length 63 / K[0]≈57.023495）更新为 `(9,3,3)` 实际输出（落地时跑 core 一次取真值，写死为断言） |
| `vo/*`、`dto/*`、`indicator.module.ts`、`chan.module.ts` | 零改动 |

委托映射（转换层专属，无其他逻辑）：
```ts
async runMACD(prices: number[]) {
  const { begIndex, macd, signal, histogram } = computeMacdSeries(prices.map(Number));
  return { begIndex, nbElement: macd.length, macd, signal, histogram };
}
async runRSI(prices: number[], period = 14) {
  const { begIndex, rsi } = computeRsiSeries(prices, period);
  return { begIndex, nbElement: rsi.length, rsi };
}
async runKDJ(data: RunKDJDto) {
  const { begIndex, K, D, J } = computeKdjSeries(data.high, data.low, data.close, {
    period: data.period, kSmoothing: data.kSmoothing, dSmoothing: data.dSmoothing,  // undefined → core 默认 9/3/3
  });
  return { begIndex, nbElement: K.length, K, D, J };
}
async runADX(data)  { const { adx } = computeAdxSeries(data.high, data.low, data.close, data.period); return adx; }
async runATR(data)  { const { atr } = computeAtrSeries(data.high, data.low, data.close, data.period); return atr; }
async runDualMA(data) { const { shortMA, longMA } = computeDualMaSeries(data.close, { shortPeriod: data.shortPeriod, longPeriod: data.longPeriod }); return { shortMA, longMA }; }
```

### Phase E — strategy 委派（`libs/strategy/`，②③ 接入）

| 文件 | 改动 |
|------|------|
| `src/analysis/strategy-macd.ts` | 移除 `import { MACD } from 'technicalindicators'`；`calculateStrategyMacd` 改为：`requireExactStrategyBars(bars, 130, 'MACD(12,26,9)')` 保留 → `computeMacdObservation(bars.map(b => b.close), { windowSize: 130 })` → 返回 `{line, signal, histogram}`。`StrategyMacdObservation` 改为 `export type StrategyMacdObservation = MacdObservation`（或直接复用 core 类型） |
| `src/analysis/strategy-kdj.ts` | 同法：`calculateStrategyKdj` → `computeKdjObservation(highs, lows, closes, { windowSize: 13 })` → `{k, d, j}`；常量 `STRATEGY_*_CALCULATION_BAR_COUNT` 保留（catalog 数值 + windowSize 双保险） |
| `src/index.ts` | 导出不变（常量/函数/类型仍从 analysis 模块 re-export） |
| `src/analysis/strategy-analysis.spec.ts` | **全绿不动**（委派后输出逐值等价，原有断言即等价性证明）；新增：委派等价性用例（同窗口输入，断言 `calculateStrategyMacd` 与 `computeMacdObservation` 输出相等） |

> 依赖方向：`libs/strategy → @app/indicators`（纯库，无环）。`StrategyAnalysisObservationCache` 的
> current/previous 窗口切片（`slice(-130)` / `slice(-131,-1)`）与缓存语义不动。

### Phase F — 边界守卫（落地实现）

| 文件 | 内容 |
|------|------|
| `libs/indicators/src/indicators-boundary.guard.spec.ts` | 三个断言块（照 chancore-boundary.guard.spec.ts 结构）：① 注册断言（nest-cli/tsconfig/moduleNameMapper 精确匹配 `@app/indicators` → `libs/indicators/src/index.ts`）；② 纯净守卫（src 下非 spec 文件不 import `@app/@nestjs/typeorm/mysql2/ioredis/redis/bullmq/axios/undici/http/https/dotenv`、不读 process.env、相对 import 不出 `libs/indicators/src`）；③ **technicalindicators 收敛守卫**：扫描全仓 `apps/**/src` + `libs/**/src` 的 .ts 文件，断言 `technicalindicators` import 仅出现在 `libs/indicators/` 下 |

### Phase G — 跨仓同步（KDJ 修复影响面，`mist-skills` 仓库）

| 文件 | 改动 |
|------|------|
| `skills/technical-indicators/SKILL.md`（约 L20-22） | "Default parameters: period=14, kSmoothing=3, dSmoothing=3" → **period=9**（与后端新默认一致；KDJ 唯一真实消费者是 AstrBot 的 `kdj.py`，请求不带参数吃后端默认，修复后 bot 回复数值会变——确认为有意行为） |

> mist-fe 零 KDJ 消费（只调 `/v1/indicators/k` 与 `/v1/chan/*`，均不变）。`kdj.py`/测试不改（mock 透传，不校验真实数值）。**注意 KDJ 修复同时影响 8001(mist) 与 8008(chan) 两个端口**（chan 经 ChanModule 暴露同一 controller）。

### Phase H — add-chan-divergence（spec 层已完成裁剪）

无代码改动（该 change 暂停中）；实施计划只需其 tasks 5.1 编排链在续做时引用 `computeMacdSeries(closes).histogram`（已更新）。

## 2. 测试用例清单（汇总）

| # | 用例 | 位置 |
|---|------|------|
| T1 | 六 series 与现实现逐值一致（golden） | libs/indicators/*.spec.ts |
| T2 | Observation === Series 末位不变量（MACD/KDJ 各 ≥3 组输入） | libs/indicators/*.spec.ts |
| T3 | windowSize 硬校验（匹配✓ / 不匹配抛 IndicatorInputError；KDJ 13、MACD 130） | libs/indicators/*.spec.ts |
| T4 | 末位非有限 → IndicatorValueError | libs/indicators/*.spec.ts |
| T5 | 空输入/不足 warmup：空数组 + begIndex=输入长度、不抛错 | libs/indicators/*.spec.ts |
| T6 | 确定性 + 入参不变异（深拷贝前后对比） | libs/indicators/*.spec.ts |
| T7 | computeUnitForces：面积和/截断/边界/空区间→0 | libs/indicators/force.spec.ts |
| T8 | 纯净守卫 + 注册断言 + 收敛守卫 | indicators-boundary.guard.spec.ts |
| T9 | indicator.service.spec：MACD/RSI 全绿；**KDJ 用例更新为 (9,3,3) 真值** | apps/mist 既有 spec |
| T10 | strategy analysis：全绿（逐值等价）；新增委派等价性用例 | libs/strategy spec |

## 3. 验证命令（Phase 完成后按序执行）

```bash
# 仓库根 /Users/moyui/sean/mist/mist（worktree 内）——本仓库用 pnpm（--legacy-peer-deps 被拒，勿加）：
pnpm run lint:check
pnpm run typecheck
pnpm run test:ci            # 含 libs/indicators 全套 + indicator.service.spec + strategy analysis
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict   # 期望 72/72 全绿
```

验收标准：
- 全命令通过；`technicalindicators` 全仓 grep 仅剩 `libs/indicators/`（`grep -rn "technicalindicators" apps libs --include="*.ts"`）；
- `POST /v1/indicators/macd|rsi` 响应与改造前逐值一致（由 spec 断言锁定）；`/v1/indicators/kdj` 输出按新 (9,3,3)（KDJ 用例新真值锁定）。

## 4. 风险与注意事项

1. **KDJ API 行为变更**：唯一输出变化；影响 AstrBot 的 KDJ 回复数值 + SKILL.md 文档（Phase G）；8001/8008 双端口同时生效；已用户拍板"顺手修"。
2. **golden 夹具取值**：KDJ 新预期值在落地时跑 core 取真值写死（不要手算），确保断言与被测实现同源但不循环（先独立脚本算一次再固化）。
3. **`requireExactStrategyBars` 保留**：strategy 侧窗口校验先于 core 的 windowSize 校验，行为等价但**错误类型不同**（前者 TypeError/RangeError，后者 IndicatorInputError）——现有 strategy 测试断言的是旧错误类型，保持不动（先校验仍由 strategy 抛）。
4. **README/文档**：落地阶段视需要补充 `docs/indicators-core.md`（模块级说明），遵循 module-readme-writer 技能。
5. **jest test:ci 挂死教训**：新 spec 使用现有 `--forceExit` 脚本即可，不再新增 jest 命令。

## 5. 实施顺序与提交节奏（建议 2 个 commit）

1. **commit 1（core+守卫）**：Phase A-F 的库与守卫 + 全量单测绿；
2. **commit 2（接入+同步）**：Phase D（API 转换层 + KDJ 修复 + spec 更新）、Phase E（strategy 委派）、Phase G（mist-skills SKILL.md）——三个 repo 分别提交（mist / mist-skills）。