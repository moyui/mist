# 实施计划 — add-chan-bsp-realtime-evaluation

配套 OpenSpec change：`openspec/changes/add-chan-bsp-realtime-evaluation/`（proposal/design/tasks/
delta specs 已确认）。本计划是代码级落地细节，普通 markdown。

---

## 0. 质量约束映射（governance guide §2/§5/§6/§8/§9/§10/§11）

| Guide 条目 | 本 change 的落实 |
|---|---|
| §6.5 K 线精度/缺失 | `toChanKSeries` 输入 = **投影后窗口**（`ProjectedStrategyBar[]`，`SharedStrategyWindowStore.read()` 的输出）：OHLC 取 `ohlc.effective`（与 DSL `k.*` 一致；unavailable → 该 bar 剔除，不抛错不补零）；volume/amount 取 `effective`（补齐已在窗口层完成，`StrategySeriesImputer` 是唯一批准的补齐层；unavailable 时 null 直传 chancore，不补零、不二次补齐）；detector 不做任何 `Number()` 转换 |
| §6.6 数据库 | `kind` 物理列 snake_case 显式映射；migration forward-only（020）；entity metadata/migration/审计同步 |
| §6.7 冻结决策 | 不恢复 Chan persistence、不新增 AlertEvent 主表字段、不启用 schedule；detector 是请求时实时派生计算（与冻结决策一致） |
| §8 并发/资源 | 游标 Map 有界：registry reconcile 时 `retainIdentities` 裁剪 + 交易日切换 `reset()`；detector 同步纯计算、无跨 await 共享集合（worker concurrency=1 串行）；窗口复用 `SharedStrategyWindowStore` 分组缓存（reconcile 已有裁剪）；同步计算与现有 evaluator 一致不检查 job deadline，由窗口预算（§5）保证计算量有界 |
| §9 跨仓矩阵 | 本 change 只动 `mist` 仓；无 wire/OpenAPI/环境变量/metrics/Compose 变化 → `mist-datasource`/`mist-deploy`/`mist-monitoring`/`mist-fe`/terminal 零改动；`CreateStrategyDefinitionDto.kind` 可选且默认 `rule_dsl` → 前端不传也兼容（fe 无改动） |
| §10 短检查清单 | 逐条执行（见 §9 验证） |
| 命名规则（§7） | kebab-case 文件、`.types/.detector/.episode/.k-mapper/.force` 后缀；不引入无作用域 `ready`；词汇用 `units/level/points/direction`（新领域词，无历史冲突） |

**§5 必须停下讨论的项**：本 change 无 provider 语义、无数据库字段改名/删列/精度变化、
无兼容层/双写、无新市场。`kind` 列是纯新增 additive 列，default 语义明确。无需要暂停的项。

---

## 1. 前置与基线（tasks 1.x）

```bash
# 记录基线
cd /Users/moyui/sean/mist/mist
GIT=/usr/local/bin/git
$GIT log -1 --oneline && $GIT status --porcelain | head
# 基线全量
pnpm run lint:check && pnpm run typecheck && env TZ=UTC pnpm run test:ci && openspec validate --changes
```

数据前提验证（tasks 1.3）：只读查 MySQL `k` 表 5/15/30/60 覆盖（代表 security 各 period
存量行数），决定 shadow 首选级别，记录 evidence。

---

## 2. 数据库（tasks 2.x）

### 2.1 新枚举 `libs/shared-data/src/enums/strategy-kind.enum.ts`

```ts
export enum StrategyKind {
  RULE_DSL = 'rule_dsl',
  CHAN_BSP = 'chan_bsp',
}
```
`libs/shared-data/src/enums/index.ts` 导出。

### 2.2 实体 `libs/shared-data/src/entities/strategy-definition.entity.ts`

```ts
@Column({ type: 'enum', enum: StrategyKind, default: StrategyKind.RULE_DSL })
kind: StrategyKind = StrategyKind.RULE_DSL;
```

### 2.3 migration `deploy/database/migrations/020_strategy_definitions_kind.sql`

```sql
ALTER TABLE `strategy_definitions`
  ADD COLUMN `kind` ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl' AFTER `status`;
```

- forward-only，next real = 020（当前 019，绝不 reuse 已有号）；
- 同步 ORM metadata、审计/repair-forward SQL（若有引用该表处）；
- migration 单测/readback：preflight（列缺失）→ apply → postflight（列存在、default 生效）→
  存量行 kind='rule_dsl'。

---

## 3. ChanBspDetector（tasks 3.x，`apps/signal/src/realtime/chan/`）

### 3.1 `chan-bsp.types.ts`

```ts
export interface ChanBspPlan {
  readonly units: 'bi' | 'duan';
  readonly points: { first: boolean; second: boolean; third: boolean };
  readonly direction: 'buy' | 'sell' | 'both';
  readonly requiredBarCount: number; // 内部预算，编译时按 level 填入
}

export type ChanBspEventType =
  | 'first_buy' | 'first_sell' | 'second_buy' | 'second_sell' | 'third_buy' | 'third_sell';

export interface ChanBspEvent {
  readonly type: ChanBspEventType;
  readonly units: 'bi' | 'duan';
  readonly time: Date;          // units[unitIndex].endTime
  readonly price: number;       // 买=确认段 low / 卖=确认段 high
  readonly zhongshuIndex: number | null; // 二类恒 null
  readonly zg: number | null;
  readonly zd: number | null;
  readonly unitIndex: number;   // 增量游标用
}

export const REALTIME_CHAN_BSP_LEVELS: readonly number[] = [1, 5, 15, 30, 60];

export const CHAN_BSP_WINDOW_BUDGET: Readonly<Record<1 | 5 | 15 | 30 | 60, number>> = {
  1: 800, 5: 500, 15: 300, 30: 200, 60: 120,
};
```

### 3.2 `chan-bsp.k-mapper.ts`

```ts
export function toChanKSeries(window: readonly ProjectedStrategyBar[]): readonly ChanK[];
```
- 输入 = `ProjectedStrategyBar[]`（evaluation 窗口 `windows.read()` 的**投影后**形态，
  `add-dynamic-series-imputation` 已合并：imputer 统一补齐 OHLCVA、值单调不可变）：
  - `id = index + 1`、`symbol = String(securityId)`、`time = rawBar.timestamp`（已保证严格递增）；
  - **OHLC 取 `projected.ohlc.effective`**（与 DSL `k.*` 一致，消费 effective 视图）；
    `effective === null`（unavailable，整段无锚点的极端场景）→ **该 bar 从 ChanK 序列剔除**
    （防御性过滤，不抛错、不补零）；剔除后序列不足以产点 → chancore 自然返回空 →
    detector 返回 `[]`（"结构不足"语义，非错误）；
  - `volume/amount` 取 `projected.volume.effective / projected.amount.effective`——补齐已在
    窗口层完成（`StrategySeriesImputer`）；仅当 `resolution='unavailable'` 时才是 null，
    原样直传 chancore（`ChanK` 原生接受 null），不补零、不二次补齐；

### 3.3 `chan-bsp.pipeline.ts`

```ts
export interface ChanBspPipelineInput {
  readonly klines: readonly ChanK[];
  readonly units: 'bi' | 'duan';
}
export function runChanBspPipeline(input: ChanBspPipelineInput): readonly ChanBspEvent[];
```

内部（全部 `ChanCore` 静态方法，无 I/O）：
```
mergeK(klines) → findFenxings → createBi → bis.phaseB
├─ units='duan'：createDuan(bis.phaseB) → createDuanChannels(duans)（取 phaseB）
│    units = duans 映射 ChanBspUnit（startTime/endTime/high/low/trend 同构直取）
│    zhongshus = duanChannels.phaseB 映射 ChanDivergenceZhongshu
│       （firstUnitTime=duans[0].startTime / lastUnitTime=duans.at(-1).endTime / zg/zd/gg/dd 直取）
└─ units='bi'  ：createChannels(klines)（取 phaseB）
     units = bis.phaseB 映射 ChanBspUnit
     zhongshus = channels.phaseB 映射 ChanDivergenceZhongshu（first/last unit time 由 bis 端点取）

力度：closes = klines.map(k => k.close)
  macd = computeMacdSeries(closes)
  areas  = computeUnitDirectionalAreas(macd.histogram, macd.begIndex, kTimes, units, directions)
  peaks  = computeUnitLinePeaks(macd.macd, macd.begIndex, kTimes, units)
  forces[i] = { area: areas[i],
                peak: directions[i]==='up' ? Math.abs(peaks[i].max) : Math.abs(peaks[i].min) }

points = ChanCore.detectBuySellPoints({ units, zhongshus, forces })
→ 每个 point 映射 ChanBspEvent：
  type = ChanBspType → ChanBspEventType（first_buy/... 直接同构）
  time = units[point.unitIndex].endTime
  price = point.price
  zhongshuIndex = point.zhongshuIndex（非 null 时反查 zhongshus → zg/zd；null → zg/zd=null）
  unitIndex = point.unitIndex
```

### 3.4 `chan-bsp.detector.ts`

```ts
export class ChanBspDetector {
  // 无状态纯函数：投影后窗口 → 全量已确认点（按 plan 过滤后）
  evaluate(window: readonly ProjectedStrategyBar[], plan: ChanBspPlan): readonly ChanBspEvent[] {
    if (window.length < plan.requiredBarCount) return [];
    const events = runChanBspPipeline({ klines: toChanKSeries(window), units: plan.units });
    return events.filter(按 plan.points / plan.direction);
  }
}
```
- 空窗口/结构不足：返回 `[]`（不是错误，不是 unavailable）；
- 确定性：同窗口同 plan 两次调用结果相同（无状态，可直接 assert）。

### 3.5 `chan-bsp.episode.ts`（增量游标）

```ts
export interface ChanBspEpisodeIdentity {
  readonly definitionId: number;
  readonly securityId: number;
  readonly source: 'tdx' | 'qmt';
  readonly level: number;
  readonly units: 'bi' | 'duan';
}
export class ChanBspEpisodeCursor {
  advance(identity: ChanBspEpisodeIdentity, events: readonly ChanBspEvent[]): readonly ChanBspEvent[];
  // 过滤 unitIndex > lastEmittedUnitIndex；若有新点，游标 = max(unitIndex)
  reset(): void;                                  // 交易日切换（与 evaluation.reset 同源）
  retainIdentities(keys: ReadonlySet<string>): void; // registry reconcile 时裁剪（有界）
  diagnostics(): { activeCursorCount: number };
}
// key = `${definitionId}\0${securityId}\0${source}\0${level}\0${units}`
```

### 3.6 装配

`apps/signal/src/realtime/signal-app.module.ts`（或现有 realtime 模块）：注册
`ChanBspDetector` + `ChanBspEpisodeCursor` provider；`CandleFinalizedJobProcessor` /
`RealtimeStrategyEvaluationService` 构造注入。

---

## 4. registry 编译分派（tasks 4.x）

### 4.1 `apps/signal/src/signal-registry.types.ts`

```ts
export type SignalRegistryExecutionPlan =
  | { readonly kind: 'rule_dsl'; readonly plan: CompiledStrategyExecutionPlan }
  | { readonly kind: 'chan_bsp'; readonly plan: ChanBspPlan };
```
`SignalRegistryDefinition.executionPlan` 改用 union 类型（`ruleSnapshot` 字段保留，两类都存原始 rule）。

### 4.2 `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`

`RealtimeStrategyExecutionPlan` 同步变 union（`{kind, plan, ruleSnapshot, definitionId, versionId, source, period}` 公共部分 + kind 专属 plan）。导出 `ChanBspPlan` 类型（从 `@app/signal` barrel）。

### 4.3 `apps/signal/src/signal-registry.service.ts`

```ts
function compileRegistryDefinition(def, securityIdsByCode): SignalRegistryDefinition {
  // ...现有校验（currentVersion/ruleSchemaVersion）不动...
  const plan = def.kind === StrategyKind.CHAN_BSP
    ? compileChanBspConfig(version.rule, definition.periods)
    : compileStoredStrategyRuleWithNormalized(version.rule, version.signalKind);
  // executionPlan: { kind, plan } 按 kind 组装
}

export function compileChanBspConfig(rule: Record<string, unknown>, periods: Period[]): ChanBspPlan {
  // 校验：units ∈ {bi,duan}；points 至少一项 true；direction ∈ {buy,sell,both}；
  //       periods.length === 1 && REALTIME_CHAN_BSP_LEVELS.includes(periods[0])
  // 非法 → 抛 ChanBspConfigError（registry 编译失败 → 现有 registry 失败语义）
  // requiredBarCount = CHAN_BSP_WINDOW_BUDGET[periods[0]]
}
```
- `executionPlansFor` 适配 union（现有过滤/排序逻辑不动）。
- `CandleFinalizedJobProcessor.reconcileRegistry` 中 `groups/episodes` 组装不变（用公共字段）。

---

## 5. evaluation 求值分派（tasks 4.3/4.4）

`libs/signal/src/runtime/realtime-strategy-evaluation.service.ts`：

```ts
constructor(marketData, windows, episodes,
  chanBspDetector = new ChanBspDetector(),   // 可注入（测试传 fake）
  chanBspCursors = new ChanBspEpisodeCursor(),
)

evaluate(bar, plans) {
  // 现有骨架不动：eligible 过滤 → requiredBars → windows.prepare → windows.read
  for (const execution of eligible) {
    if (execution.kind === 'rule_dsl') {
      // 现有 evaluateStrategyPlan 路径（不动）
    } else {
      const events = this.chanBspDetector.evaluate(projected, execution.plan);
      const identity: ChanBspEpisodeIdentity = {
        definitionId, securityId: bar.securityId, source, level: bar.period, units: plan.units,
      };
      const fresh = this.chanBspCursors.advance(identity, events);
      for (const event of fresh) candidates.push(toCandidate(execution, bar, event));
    }
  }
}

function toCandidate(execution, bar, event): ShadowStrategyCandidate {
  // signalKind: event.type 含 'buy' → 'entry'，'sell' → 'exit'
  // signalTime = event.time；triggerTime = event.time.toISOString()；triggerPrice = event.price
  // barType = bar.type；contextSnapshot = { chanBsp: { type, units, zhongshuIndex, zg, zd } }
  // ruleSnapshot = execution.ruleSnapshot（chan_bsp 配置原样）
}
```

- `reset()`：追加 `chanBspCursors.reset()`（交易日切换）。
- `retainRegistryScopes()`：追加 `chanBspCursors.retainIdentities(...)`（有界）。
- `diagnostics()`：追加 `activeChanBspCursorCount`。
- 窗口不足（`window.length < requiredBarCount`）→ detector 返回 `[]` → 该 plan 无 candidate，
  不标记 `unavailable`（符合 delta spec）。

---

## 6. 管理面（tasks 5.x，`apps/mist`）

### 6.1 `apps/mist/src/strategy/dto/create-strategy-definition.dto.ts`

```ts
@IsEnum(StrategyKind)
@IsOptional()
readonly kind?: StrategyKind;   // 缺省 → RULE_DSL（现有调用完全兼容）
```

### 6.2 `apps/mist/src/strategy/services/strategy-definition.service.ts`

- 创建/更新时：`dto.kind === CHAN_BSP` → `validateChanBspConfig(dto.rule, dto.periods)`；
- 校验失败抛现有 `ValidationError`（`VALIDATION_ERROR` envelope）；
- `rule_dsl`（含缺省）路径完全不动。

```ts
function validateChanBspConfig(rule, periods): void {
  // 同 §4.3 编译校验规则（units/points/direction/periods 单值 ∈ REALTIME 档）；
  // 日线(1440)及更长 → 拒绝（实时档未支持，注释说明）
}
```

---

## 7. 可观测性（tasks 6.x，用户偏好：判断点日志必须进 OpenObserve）

- 日志走现有管线：`Nest Logger`（nestjs-pino，`signal-app.module.ts` 已装配）→ Docker 入口
  `node -r @opentelemetry/auto-instrumentations-node/register` 的 instrumentation-pino 捕获
  → OTLP → OpenObserve logs（与现有 signal/backtest 日志同路径，零新机制）；
- info 生命周期日志（registry 编译成功，低频）：
  - `chan_bsp plan compiled {definitionId, level, units}`；
- warn 判断点日志（仅配置错误，运维需知）：
  - `chan_bsp_config_invalid`（编译拒绝，reason：units/points/direction/periods）；
- **不日志**：窗口不足 / 结构不足以产点是**常态空结果**（与 DSL `evaluated_not_matched`
  一致，每 bar 打 warn 会刷屏）——通过 evaluation diagnostics
  （`activeChanBspCursorCount`）与 shadow 观测暴露；
- **进 OO 验证**（tasks 6.x 收尾项）：OO 搜索 API
  `POST /api/default/_search?type=logs`（时间窗口用微秒），按日志字段查
  `chan_bsp_config_invalid` / `chan_bsp_plan_compiled` 可检索（生产 OTLP 凭据/路径按
  AGENTS.md 第三节）；
- 不新增 metric 命名空间（shadow 阶段看日志与 diagnostics；触发频率统计走 OpenObserve 查询）。

---

## 8. 测试清单（tasks 3.x/4.x/5.x）

| 文件 | 用例 |
|---|---|
| `chan-bsp.k-mapper.spec.ts` | OHLC 直传；非有限 OHLC fail closed；volume/amount null 保留；id/symbol/time 映射 |
| `chan-bsp.pipeline.spec.ts` | chancore characterization fixture K 序列 → 手标断言点类型/price/time；bi 与 duan 两分支；forces 方向选择（up→\|max\| / down→\|min\|）；zhongshuIndex 反查 zg/zd；二类 zg/zd=null |
| `chan-bsp.detector.spec.ts` | 窗口不足 → []；结构不足 → []；points/direction 过滤；确定性（两次调用全等） |
| `chan-bsp.episode.spec.ts` | 新点 emit；重现不报；同段多类型独立 emit；游标单调；reset；retainIdentities 裁剪 |
| `signal-registry.service.spec.ts`（增补） | kind 分派；chan_bsp 非法配置拒绝；union plan 形态；ruleSnapshot 保留 |
| `realtime-strategy-evaluation.service.spec.ts`（增补） | chan_bsp plan 求值 → candidate 形态；signalKind 推导；窗口不足不标记 unavailable；rule_dsl 路径回归不变 |
| `strategy-definition.service.spec.ts` / dto（增补） | kind 缺省兼容；chan_bsp 非法配置；多 period 拒绝；日线档拒绝 |
| migration 单测/readback | preflight/postflight/存量行 default |

---

## 9. 验证命令（tasks 7.x，governance §11 基线）

```bash
cd /Users/moyui/sean/mist/mist
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci      # jest 脚本带 --forceExit
pnpm run ci:contracts
pnpm run build:docker            # 确认 signal 镜像含新 lib（app 列表不变）
openspec validate --all --strict
$GIT diff --check
```

短检查清单（§10）逐条确认：仓库/SHA 基线、影响链、无混名、无补零、游标有界、
migration 同步、无恢复退役字段、退役名检索为零、验证区分通过/跳过/环境阻塞/待 HIL。

---

## 10. 跨仓影响（§9 矩阵）

| 面 | 结论 |
|---|---|
| `mist-datasource` | 零改动（无 wire/OpenAPI 变化） |
| `mist-deploy` | 零改动（无 Compose/env/health 变化；signal 镜像构建自动含新代码） |
| `mist-monitoring` | 零改动（无新指标命名空间） |
| `mist-fe` | 零改动（DTO kind 可选、默认 rule_dsl，不传完全兼容） |
| terminal bridge | 零改动 |
| 数据库 | 020 migration（additive 列） |

---

## 11. 风险与回滚

- **回滚**：`kind` 列 additive、default `rule_dsl` → 旧镜像可正常读取（新代码未写列时无影响）；
  部署层面镜像整体回滚即可；migration 不回滚（forward-only 原则，列保留无副作用）。
- **shadow 先行**：实盘验证只在 `shadow` 模式（不写表、只产候选），数据风险为零；
  观察触发频率/结构演化推翻率后再决策 `on`（tasks 7.2/7.3）。
- **性能**：缠论全量重算为同步纯计算；窗口预算上限 800 bar（1m）；30m 一天 8 次/标的；
  若 shadow 期发现超时/内存问题，先停下讨论（不加局部 override）。
- **结构演化假信号**：游标只进不退 + shadow 观察推翻率；推翻率数据支撑未来"计算引擎"设计。
