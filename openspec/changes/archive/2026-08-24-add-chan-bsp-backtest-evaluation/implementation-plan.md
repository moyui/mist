# 实施计划 — add-chan-bsp-backtest-evaluation

代码级落地细节。spec 决策以 `design.md`（D1-D8）与 delta specs 为准；本文件只回答
"改哪个文件、函数长什么样、测什么、怎么验证"。

## 0. 改动文件总览（按落地顺序）

| # | 文件 | 动作 |
|---|---|---|
| 1 | `libs/strategy/src/projection/strategy-series-imputer.ts` | 0 异常化（前置，全局） |
| 2 | `libs/strategy/src/projection/strategy-series-imputer.spec.ts` | 0 异常化用例 |
| 3 | `deploy/database/migrations/021_backtest_runs_kind.sql` | migration 021 |
| 4 | `libs/shared-data/src/entities/backtest-run.entity.ts` | `kind` 列 |
| 5 | `libs/signal/src/runtime/chan-bsp/chan-bsp.snapshot.serializer.ts` | 新增共享 serializer |
| 6 | `libs/signal/src/runtime/chan-bsp/chan-bsp.snapshot.serializer.spec.ts` | 新增 |
| 7 | `libs/signal/src/index.ts` | 导出 serializer |
| 8 | `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts` | 实时侧收敛 serializer |
| 9 | `apps/mist/src/strategy/services/backtest-run-command.service.ts` | create 分派/门禁/period/kind |
| 10 | `apps/mist/src/strategy/services/backtest-run-command.service.spec.ts` | create 单测 |
| 11 | `apps/backtest/src/backtest-run.executor.ts` | 编译/求值分派 + 完整信号流 |
| 12 | `apps/backtest/src/backtest-run.executor.spec.ts` | 回放单测 |
| 13 | `apps/backtest/src/backtest-run-error.ts` | 新枚举值 |

落地顺序：1→2 先行（独立可合）；3→4；9→10；5→6→7→8（serializer 先于 executor 使用）；
11→12→13；最后日志与基线。

---

## 1. 前置：imputer 0 异常化（全局矫正层修正）

### 1.1 `strategy-series-imputer.ts` 改动

```ts
// 改动点 A：量价锚点——排除合法 "0"
function isQuantityAnchor(raw: string | null): boolean {
  if (raw === null) return false;
  const parsed = Decimal8.parseCanonical(raw);   // 非法字符串仍 fail-closed 抛错
  if (parsed.isZero()) return false;             // "0"/"0.0000" 等一律异常（δ 用 Decimal8 API 判零）
  return true;
}

// 改动点 B：OHLC 锚点——任一为 0 整根无效
function isOhlcAnchor(bar: StrategyBar): boolean {
  return (
    Number.isFinite(bar.open) && bar.open !== 0 &&
    Number.isFinite(bar.high) && bar.high !== 0 &&
    Number.isFinite(bar.low)  && bar.low  !== 0 &&
    Number.isFinite(bar.close) && bar.close !== 0
  );
}
```

- 头注释契约文本同步：`a quantity anchor requires a valid non-zero canonical
  decimal string`、`an OHLC anchor requires all four values finite and non-zero`。
- 其余（分段补齐/跨日不携带/值单调/hydrate 定死）零改动——0 异常化只收紧锚点判定。
- **行为影响**：实时窗口与回测两段式共用本函数，自动同时生效。

### 1.2 `strategy-series-imputer.spec.ts` 新增用例

1. 量价 `"0"`：开头/中间/末尾三位置各一例——不 observed，走 backfilled/forwardFilled/unavailable；
2. 混合：`["100","0",null]` → 中位 backfilled 用后锚 `100`（量价独立于 OHLC 判定）；
3. 全 `"0"` 窗口 → 量价 unavailable（不虚构）；
4. OHLC 含 0（如 open=0 其余正常）→ 整根 ohlc 非锚点 → 邻近非 0 锚点补齐；全 0 窗口 unavailable；
5. 跨交易日：上一交易日末 `"0"` 不污染下一交易日首根（lastVolume/lastAmount 保持 null）；
6. 确定性：0 异常化后同输入两次调用全等（现有断言扩展）。

---

## 2. migration 021 + 实体

### 2.1 `021_backtest_runs_kind.sql`

```sql
-- forward-only；存量 run 全部 default 'rule_dsl' 天然安全
ALTER TABLE `backtest_runs`
  ADD COLUMN `kind` ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl' AFTER `status`;
```

（列位置以实体现有列序为准；加 `AFTER` 具体列在实施时对照 `SHOW COLUMNS`。）

### 2.2 `backtest-run.entity.ts`

```ts
@Column({ type: 'enum', enum: StrategyKind, default: StrategyKind.RULE_DSL })
kind: StrategyKind = StrategyKind.RULE_DSL;
```

（`StrategyKind` 已存在于 `@app/shared-data`，020 已定义。）

---

## 3. create 侧（apps/mist `backtest-run-command.service.ts`）

### 3.1 注入新增

```ts
@InjectRepository(StrategyDefinition)
private readonly definitionRepository: Repository<StrategyDefinition>,
```

### 3.2 `createRun` 校验段改造（现 L75-98 区域）

```ts
// 现有：startDate 校验 + version 加载（不动）
const definition = await this.definitionRepository.findOne({
  where: { id: version.strategyDefinitionId },
});
if (!definition) {
  throw new NotFoundException(`Strategy definition not found`);
}

let kind: StrategyKind;
if (definition.kind === StrategyKind.CHAN_BSP) {
  // 分派编译先行（chan_bsp 配置不是 DSL 树，compileStoredVersion 会炸）
  try {
    compileChanBspConfig(version.rule, definition.periods);   // 校验即编译，产物弃用
  } catch (error) {
    if (error instanceof ChanBspConfigError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
  // period 早失败（D6 主校验）
  if (dto.period !== 1 && dto.period !== 5 && dto.period !== 15 &&
      dto.period !== 30 && dto.period !== 60) {
    throw new BadRequestException({
      code: 'CHAN_BSP_PERIOD_UNSUPPORTED',
      message: 'chan_bsp replay period must be one of 1/5/15/30/60',
    });
  }
  kind = StrategyKind.CHAN_BSP;
  // quantity 门禁跳过（chan_bsp 无 fields，见 D3）
} else {
  const plan = this.planService.compileStoredVersion(version);   // 现有不动
  if (plan.fields.some((f) => f === 'k.volume' || f === 'k.amount')) {
    throw new ConflictException({
      code: 'BACKTEST_QUANTITY_PROFILE_UNAVAILABLE',
      message: 'Historical quantity profile is not approved for backtest replay',
    });
  }
  kind = StrategyKind.RULE_DSL;
}
```

### 3.3 `runRepository.create` 增加一行

```ts
kind,                                        // 3.2 分支决定的快照
```

### 3.4 create 单测（`backtest-run-command.service.spec.ts` 增补）

1. chan_bsp 版本 + period=30 → 创建成功：`run.kind='chan_bsp'`、无 quantity 拒绝、RPC submit 调用一次；
2. chan_bsp + period=1440/3 → HTTP 400 `CHAN_BSP_PERIOD_UNSUPPORTED` 且 **runRepository.save 未被调用**；
3. chan_bsp + 非法 rule（units=xxx）→ 400（compileChanBspConfig 抛 ChanBspConfigError 映射）；
4. definition 不存在 → NotFound；
5. DSL 版本回归：现有用例全绿（门禁/提交行为不变）。

---

## 4. executor 侧（apps/backtest `backtest-run.executor.ts`）

### 4.1 注入新增

```ts
@InjectRepository(StrategyDefinition)
private readonly definitionRepository: Repository<StrategyDefinition>,
```
构造器内新增（per-instance 共享，无需清理：run 生命周期=executor 实例）：
```ts
private readonly chanBspDetector = new ChanBspDetector();
```

### 4.2 本地 union 类型（文件顶部或 replay 内）

```ts
type ReplayPlan =
  | { kind: 'rule_dsl'; plan: CompiledStrategyExecutionPlan }
  | { kind: 'chan_bsp'; plan: ChanBspPlan };
```
（不引入 `RealtimeStrategyExecutionPlan` 全量 union——executor 只需 kind+plan+requiredBarCount。）

### 4.3 `replay()` 编译段改造（现 L141-152 区域）

```ts
const definition = await this.definitionRepository.findOne({
  where: { id: run.strategyDefinitionId },
});
if (!definition) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');

const plan: ReplayPlan =
  run.kind === StrategyKind.CHAN_BSP
    ? {
        kind: 'chan_bsp',
        plan: compileChanBspConfig(version.rule, definition.periods),
      }
    : {
        kind: 'rule_dsl',
        plan: compileStoredStrategyRule(
          version.rule,
          version.signalKind as 'entry' | 'exit',
        ),
      };

// 门禁按 kind 短路（D3，执行侧）
if (
  plan.kind === 'rule_dsl' &&
  plan.plan.fields.some((f) => f === 'k.volume' || f === 'k.amount')
) {
  throw new BacktestRunFailure('BACKTEST_QUANTITY_PROFILE_UNAVAILABLE');
}
// period 防御（D6，兜底老 run/绕过 create）
if (
  run.kind === StrategyKind.CHAN_BSP &&
  run.period !== 1 && run.period !== 5 && run.period !== 15 &&
  run.period !== 30 && run.period !== 60
) {
  throw new BacktestRunFailure('BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED');
}
```

编译失败（chan_bsp 非法 config，理论不可达）→ `ChanBspConfigError` 传播 → 外层现有
`catch` 归一为 `BACKTEST_EXECUTION_FAILED`（核对现有兜底路径，必要时包一层）。

### 4.4 签名适配（union 穿透）

- `replay(run)` → `replaySecurity(run, plan, version.rule, ...)`：参数改 `ReplayPlan`；
- `replayStartFor(run, plan)`：chan_bsp 无 `fields` → 走现有"非量价"分支直接
  `startDate`（类型适配：`plan.kind === 'rule_dsl' && plan.plan.fields...` 判断量价）；
- 窗口 trim 阈值：`plan.plan.requiredBarCount`（两 kind 都有该字段，类型统一后自然成立）；
- info 日志（D7）：编译成功后一行
  `this.logger.log(`backtest chan_bsp plan compiled runId=${run.id} level=${run.period} units=${plan.plan.units}`)`。

### 4.5 `replaySecurity` 求值分派 + 完整信号流（现 L297 区域）

```ts
// 循环内、≥ startDate 的 bar（矫正视图：imputer.read()，第一原则）
if (plan.kind === 'chan_bsp') {
  const events = this.chanBspDetector.evaluate(imputer.read(), plan.plan);
  const cursor = this.chanBspCursors.get(security.id);            // Map<number, ChanBspEpisodeCursor>，per security 惰性建
  const fresh = cursor.advance(chanBspIdentity(plan, run, security.id), events);
  for (const event of fresh) {
    results.push(this.resultRepository.create({
      backtestRunId: run.id,
      securityCode,
      signalTime: event.time,                                    // 真实确认时刻（可 < startDate，完整信号流）
      contextSnapshot: serializeChanBspContextSnapshot(event, run.period),
      ruleSnapshot: version.rule,
    }));
  }
  if (fresh.length > 0) { matchedCodes.add(securityCode); onSignal(); }
  // 结构不足 → 空结果不日志（与实时一致，防刷屏）
} else {
  const evaluation = evaluateStrategyPlan(plan.plan, imputer.read());   // 现有逻辑不动
  ...
}
```

- `chanBspIdentity(...)` 构造 `ChanBspEpisodeIdentity`：
  `{ definitionId: run.strategyDefinitionId, securityId: security.id, source: run.source, level: run.period, units: plan.plan.units }`
  （key 由 `chanBspIdentityKey` 生成——实时同款）。
- **无预热**：cursor 初始 -1（类内 `advance` 首次全量 emit）→ 第一根评估 bar 输出
  hydrate 段全部已确认点，各自 `signalTime` 真实——与实时激活补报一致；
- **防重复**：`advance` 的 unitIndex 单调记账天然防重复 emit（幂等键不撞）；
- **被推翻不删**：结果已 push 落库，后续 evaluate 不再返回该点也不做删除。

---

## 5. 共享 serializer（libs/signal）

### 5.1 `chan-bsp.snapshot.serializer.ts`（新增）

```ts
import type { ChanBspEvent } from './chan-bsp.types';

export interface ChanBspContextSnapshot {
  readonly chanBsp: Readonly<{
    readonly type: ChanBspEvent['type'];
    readonly units: ChanBspEvent['units'];
    readonly level: number;
    readonly zhongshuIndex: number | null;
    readonly zg: number | null;
    readonly zd: number | null;
  }>;
}

export function serializeChanBspContextSnapshot(
  event: ChanBspEvent,
  level: number,
): ChanBspContextSnapshot {
  return Object.freeze({
    chanBsp: Object.freeze({
      type: event.type,
      units: event.units,
      level,
      zhongshuIndex: event.zhongshuIndex,
      zg: event.zg,
      zd: event.zd,
    }),
  });
}
```

### 5.2 实时侧收敛（`realtime-strategy-evaluation.service.ts`）

`evaluateChanBsp` 的 contextSnapshot 内联 `Object.freeze({ chanBsp: ... })` →
`serializeChanBspContextSnapshot(event, bar.period)`（行为等价，删除内联构造）。

### 5.3 导出（`libs/signal/src/index.ts`）

`export { serializeChanBspContextSnapshot } from './runtime/chan-bsp/chan-bsp.snapshot.serializer';`

### 5.4 serializer 单测

1. 全字段形状断言（type/units/level/zhongshuIndex/zg/zd 与 event/入参一一对应）；
2. 二买（zhongshuIndex=null）与一买（有中枢）两形态；
3. 冻结性（Object.isFrozen 双层）；
4. 与实时 candidate 同构断言（serializer 输出 === 原内联构造输出）。

---

## 6. 错误码（`apps/backtest/src/backtest-run-error.ts`）

```ts
export type BacktestRunErrorCode =
  | 'BACKTEST_SOURCE_UNSUPPORTED'
  | ...（现有枚举）
  | 'BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED';   // 新增（D6 执行侧）
```

创建侧 `CHAN_BSP_PERIOD_UNSUPPORTED` 是 HTTP envelope code（BadRequestException body），
不入 BacktestRunErrorCode 枚举（与 `VALIDATION_ERROR` 同级）。

---

## 7. migration readback（`database-schema-safety` 模式）

沿用 extract 5.4 的隔离 mysql:8.4 流程：preflight（021 前 schema）→ apply 021 →
postflight（`kind ENUM NOT NULL DEFAULT 'rule_dsl'` 存在、存量行 backfill 为
rule_dsl）→ `SHOW COLUMNS` 确认 → readback（受保护表 digest 未触碰）。

---

## 8. 验证命令序列（按序执行）

```bash
# ① 0 异常化先行验证
pnpm test:ci libs/strategy/src/projection/strategy-series-imputer.spec.ts \
  libs/signal/src/runtime/shared-strategy-window.store.spec.ts \
  libs/strategy/src/evaluation/strategy-evaluation.spec.ts

# ② serializer + 实时收敛
pnpm test:ci libs/signal/src/runtime/chan-bsp/chan-bsp.snapshot.serializer.spec.ts \
  libs/signal/src/runtime/realtime-strategy-evaluation.service.spec.ts

# ③ create + executor
pnpm test:ci apps/mist/src/strategy/services/backtest-run-command.service.spec.ts \
  apps/backtest/src/backtest-run.executor.spec.ts

# ④ 完整基线
pnpm typecheck
pnpm lint:check
pnpm test:ci                      # 全量（--forceExit，脚本已带）
pnpm ci:contracts
openspec validate --all --strict
git diff --check
```

执行环境约束：jest 脚本必须 `--forceExit`（CI 挂死教训）；macOS 本机 CPU 注意分批。

## 9. 风险与回退

| 风险 | 缓解 |
|---|---|
| 0 异常化改变存量 DSL 量价语义（历史 0 变补值/不可用） | 单测锁 resolution；shadow 观察期回归验证（tasks 7.2）；语义按用户定稿"矫正层宁缺毋假" |
| create 侧分派漏改导致 chan_bsp 编译炸 | 单测 3.4-1（创建成功路径）先行锁定 |
| executor union 类型穿透遗漏（replayStartFor/trim 阈值） | 4.4 签名适配 + DSL 回归用例保持全绿 |
| 实时侧 serializer 收敛行为漂移 | 5.4-4 同构断言（旧输出 === 新输出） |
| migration 021 与存量数据 | default rule_dsl + readback（§7） |

回退：migration 021 为 additive forward-only（仅加列 default）；代码改动均在 master
单提交可控；0 异常化若 shadow 期发现量价回归问题，回退点是 imputer 锚点判定一行 +
单测（不影响 chan_bsp 分派主体）。