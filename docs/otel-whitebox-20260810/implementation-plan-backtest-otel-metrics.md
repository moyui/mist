# 实施计划（修订版）— backtest OTel 指标与判断点日志（extract-backtest-runtime 5.2）

> 2026-08-10。spec 已确认（tasks 5.2.1–5.2.10、design §12、`specs/backtest-otel-metrics/spec.md`）。
> **本版含 self-review 修正**（2026-08-10）：核对全部落点代码后的修订，见 §7 变更说明。

## 0. 前置事实（已逐行核实）

- backtest 无 observability 目录、零指标代码；状态汇聚在 `BacktestHealthStateService`
- `admission.activeCount()/waitingCount()` = active/waiting 真值源；capacity 从
  `snapshot().backtest.queueCapacity` 读（admission 构造时 `configure()` 推入）
- `failure_total` 缺 per-reason 累计（现有 `lastFailureClass` last-only）；
  `target_issue_total` 无计数（`issues` 是 replay 局部变量）
- **jest 全局 coverage 门槛存在**（package.json jest.coverageThreshold：lines 82.72 /
  statements 81.64 / functions 78.47 / branches 67.9）→ 新增行必须有测试覆盖
- jest roots = `apps/` + `libs/`，testRegex `.*\.spec\.ts$`；`test:ci` 已内置
  `--runInBand --watchman=false --forceExit`
- 日志通道零新依赖：`LoggerModule.forRoot({ mixin: pinoTraceMixin })` +
  `app.useLogger(app.get(Logger))`；**executor 已有 logger（L68）**；**补偿服务已有
  outcome 日志（L59-61 info / L65-69 error）**
- `BacktestTargetIssueCode` 可从 `@app/shared-data` 导入（barrel 已导出，executor 同源）
- `realtime-ingress.module` 是 `@Global`（L35），补偿服务在 providers（L52）→
  mist main.ts `app.get` 可解析

## 1. 分支与工作流

- 分支 `feat/backtest-otel-metrics`，基于 master `9f0a5c0`
- `git -C /Users/moyui/sean/mist/mist worktree add -b feat/backtest-otel-metrics .worktrees/backtest-otel-metrics`
  → worktree 内 `pnpm install`
- 主 worktree 已改的 3 个 openspec 文件（tasks.md / design.md / specs/backtest-otel-metrics/spec.md）
  `cp` 进 worktree → commit 1
- 4 个逻辑 commit：① openspec spec delta → ② backtest 侧全部 → ③ mist 侧全部 →
  ④ tasks 勾选 + 命名注记
- ff 合并 master（`git checkout master && git merge --ff-only`，合并前
  `git branch --show-current` 确认）+ push origin/master（主 worktree openspec 改动
  与分支提交相同 → ff 后自动 clean）

## 2. 文件改动清单（新 4 + 改 8 + main 2）

### 2.1 backtest 侧

**A. `backtest-health-state.service.ts`**（最小附加，不动 snapshot()/VO）
```ts
import type { BacktestTargetIssueCode } from '@app/shared-data';
// 字段：
private readonly failureTotals = new Map<string, number>();
private readonly targetIssueTotals = new Map<string, number>();
// recordRunFailed 改为（复用 safeFailureClass，L72 附近）：
const failureClass = safeFailureClass(code);
this.lastFailureClass = failureClass;
this.failureTotals.set(failureClass, (this.failureTotals.get(failureClass) ?? 0) + 1);
// 新方法：
recordTargetIssue(code: BacktestTargetIssueCode): void {
  this.targetIssueTotals.set(code, (this.targetIssueTotals.get(code) ?? 0) + 1);
}
// 新只读口（镜像 candle-finalizer diagnostics()）：
diagnostics(): { failureTotals: ReadonlyMap<string, number>;
                 targetIssueTotals: ReadonlyMap<string, number> }
```

**B. `backtest-run.executor.ts`**（logger 已有 L68，模板字符串风格与现状一致）
- replay 内 `issues.push({...'SECURITY_NOT_FOUND'})` 后（L174）：
  `this.health.recordTargetIssue('SECURITY_NOT_FOUND');` +
  `this.logger.warn(\`backtest target_issue code=SECURITY_NOT_FOUND securityCode=${code}\`);`
- replay 内 `issues.push({...'NO_HISTORICAL_BARS'})` 后（L209）：对称
- execute() 成功分支（L103 recordRunCompleted 旁）：
  ```ts
  const durationMs = Date.now() - startedAt;
  this.health.recordRunCompleted(durationMs);
  this.logger.log(\`backtest run completed runId=${runId} durationMs=${durationMs}\`);
  ```
- execute() catch（L105-108）：现有 `logger.error(\`Backtest run ${runId} failed\`, ...)`
  追加 `reason=${failure.code}` 字段（**不降级、不重复**）
- flushResults catch（L317-319，现无日志）：加
  `this.logger.error(\`backtest persistence_batch_failed runId=${pending[0]?.backtestRunId}\`);`
  （batch 行均属同一 run，取首行 runId，不改方法签名）

**C. `backtest-admission.service.ts`**（无 logger → 新增
`private readonly logger = new Logger(BacktestAdmissionService.name);` + import Logger）
- acceptOne 4 个判断点：not_ready（L92）/ run_failed（L103）→ warn
  `backtest command rejected reason=... runId=...`；accepted（L96/L107/L119 三处）→ info
  `backtest command accepted runId=...`；queue_full（L116）→ warn

**D. `backtest-startup.service.ts`**（无 logger → 新增）
- L76 recordStartupFailure 旁：`this.logger.error(\`backtest startup_failure kind=queue_full count=${overflowResult.affected}\`);`
- L83 收尾：`this.logger.log(\`backtest startup reconciled admitted=${admittedIds.length}\`);`
  （pending/failed 计数现场对齐——overflow 已在上面打过 error，摘要只带 admitted）

**E. 新 `apps/backtest/src/observability/backtest-metrics.ts`**（见 §3 签名与 §4 取值表）

**F. 新 `apps/backtest/src/observability/backtest-metrics.spec.ts`**（见 §5 用例）

**G. `apps/backtest/src/main.ts`**：`app.useLogger(...)` 后
```ts
registerBacktestMetrics(
  app.get(BacktestHealthStateService),
  app.get(BacktestAdmissionService),
);
```
+ 3 个 import

### 2.2 mist 侧

**H. 新 `apps/mist/src/realtime/observability/startup-compensation-metrics.ts`**（见 §3）

**I. 新 `.../startup-compensation-metrics.spec.ts`**（见 §5）

**J. 补偿服务 `realtime-strategy-startup-compensation.service.ts`**：**零改动**
（outcome 日志现状已满足 spec：completed → info L59-61、failed → error L65-69，含
submitted；对应 tasks 5.2.7 只核对）

**K. `apps/mist/src/main.ts`**：`registerCandleMetrics(...)` 块后一行
`registerStartupCompensationMetrics(app.get(RealtimeStrategyStartupCompensationService))`
+ import

### 2.3 日志落点总表（级别纪律：info=生命周期 / warn=拒绝与数据质量 / error=真实失败）

| 文件 | 级别 | 日志（模板字符串，与现状一致） | 状态 |
|---|---|---|---|
| admission | info | `backtest command accepted runId=...` | 新增 ×3 分支 |
| admission | warn | `backtest command rejected reason=... runId=...` | 新增 ×3 分支 |
| executor | info | `backtest run completed runId=... durationMs=...` | 新增 |
| executor | error | `Backtest run ... failed reason=...` | 现有补 reason |
| executor | error | `backtest persistence_batch_failed runId=...` | 新增 |
| executor | warn | `backtest target_issue code=... securityCode=...` | 新增 ×2 |
| startup | info | `backtest startup reconciled admitted=...` | 新增 |
| startup | error | `backtest startup_failure kind=queue_full count=...` | 新增 |
| compensation(mist) | info/error | 现状已满足（L59-61 / L65-69） | **零改动** |

## 3. 新文件签名

```ts
// apps/backtest/src/observability/backtest-metrics.ts
export function registerBacktestMetrics(
  health: BacktestHealthStateService,
  admission: BacktestAdmissionService,
): void

// apps/mist/src/realtime/observability/startup-compensation-metrics.ts
export function registerStartupCompensationMetrics(
  compensation: RealtimeStrategyStartupCompensationService,
): void
```
均为：模块级 `let _registered = false` → `metrics.getMeter('backtest' | 'mist-backend', '0.1.0')`
→ `createObservableGauge(...).addCallback(...)` → 收尾 `_registered = true`。

## 4. 10 gauge callback 取值

| gauge | callback |
|---|---|
| `mist_backtest_ready` | `snapshot().backtest.ready ? 1 : 0` |
| `mist_backtest_active_runs` | `admission.activeCount()` |
| `mist_backtest_waiting_runs` | `admission.waitingCount()` |
| `mist_backtest_capacity_total` | `snapshot().backtest.queueCapacity` |
| `mist_backtest_command_total` | 4 点 accepted/queue_full/not_ready/run_failed（零值照发） |
| `mist_backtest_run_total` | 2 点 completed/failed（零值照发） |
| `mist_backtest_duration_seconds` | `observations.lastRunDurationSeconds`，**null 跳过** |
| `mist_backtest_persistence_total` | 2 点 success=resultBatchCount / failure=resultBatchFailureCount |
| `mist_backtest_failure_total` | 循环 `diagnostics().failureTotals`，`total > 0` 才 observe |
| `mist_backtest_target_issue_total` | 循环 `diagnostics().targetIssueTotals`，`total > 0` 才 observe |

补偿：`mist_startup_compensation_total` → `result.observe(1, { outcome: compensation.snapshot().outcome })`

## 5. 测试用例

公共手法（镜像 candle-metrics.spec.ts）：`beforeEach` =
`InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)` + `MeterProvider({readers:
[PeriodicExportingMetricReader({exporter})]})` + `metrics.setGlobalMeterProvider(provider)`；
`afterEach` = `provider.shutdown()`；mock = 对象字面量 `as unknown as XxxService`。

**`backtest-metrics.spec.ts`（2 个测试，candle 同款结构）**：
1. mock health（snapshot 全量 VO：ready=true、queueCapacity=8、command 4 counter 含
   not_ready=0、run 2 counter、resultBatch 2 counter、lastRunDurationSeconds=12.5）+
   diagnostics（failureTotals [EXECUTION_TIMEOUT→2]；targetIssueTotals
   [SECURITY_NOT_FOUND→1, NO_HISTORICAL_BARS→3]）+ mock admission（activeCount→2,
   waitingCount→1）→ 断言 10 指标名/值/label（command 4 点含 **not_ready=0 零值点存在**、
   failure 1 点 reason=EXECUTION_TIMEOUT value=2、target_issue 2 点）→ 然后**可变 mock**：
   把 `lastRunDurationSeconds` 置 null → `exporter.reset()` → 再 `provider.forceFlush()` →
   断言 `mist_backtest_duration_seconds` 无 dataPoint（其余值不变）。
   （注：不能用三个独立测试——模块级 `_registered` 注册一次后无法再注册；candle 用
   2 测试即为此。`InMemoryMetricExporter.reset()` 需在落地时确认可用；不可用则退路 =
   `jest.resetModules()` 双 describe。）
2. 幂等：第二次注册（新 provider）→ 零记录。

**`startup-compensation-metrics.spec.ts`（2 个测试）**：
1. mock compensation snapshot() → `{outcome:'completed', submitted:3}` → 断言
   value=1、`attributes.outcome==='completed'`。
2. 幂等：二次注册 → 零记录。

**覆盖率补充（coverage 门槛 82.72，必做）**：
- `backtest-health-state.service.spec.ts`（现有）追加断言：recordTargetIssue 累加、
  diagnostics() 返回两 Map、recordRunFailed 后 failureTotals 含 reason（覆盖新行与
  `?? 0` branch）
- executor spec：落地时确认 replay issue 路径是否已被驱动（覆盖 2 行
  recordTargetIssue + 2 条新日志）；未覆盖则补最小用例
- admission spec：acceptOne 各分支 spec 大概率已驱动（覆盖新日志行），落地时验证
- startup 无 spec：2 条新日志行若掉覆盖率，跑 `pnpm test:coverage` 实测——新 spec
  文件 100% 覆盖通常能拉回；仍不足则补 startup 最小 spec（可选，见 §6 验证）

## 6. 验证命令（worktree 内）

```bash
pnpm typecheck
pnpm lint:check
pnpm exec jest backtest-metrics --runInBand        # 快速迭代单文件
pnpm exec jest startup-compensation-metrics --runInBand
pnpm exec jest apps/backtest --runInBand           # backtest app 全量
env TZ=UTC pnpm run test:ci                        # 全仓（已内置 --forceExit）
pnpm run test:coverage                             # 覆盖率门槛验证（≥82.72 lines）
openspec validate extract-backtest-runtime --strict && openspec validate --changes
git diff --check
```

## 7. self-review 修正说明（相对初版计划）

1. **J 零改动**：补偿服务 outcome 日志现状已满足 spec（L59-61 info / L65-69 error）——
   初版计划误判为"需新增"；spec/design 措辞已对齐（failed → **error** 不降级）
2. **日志级别纪律**：warn=拒绝/数据质量（command rejected、target_issue），
   error=真实失败（run failed 现状、persistence_batch_failed、startup_failure）——
   初版计划把 run failed/persistence 列为 warn，与现状 error 不一致
3. **executor 已有 logger（L68）与部分日志**（claim 失败 L92、run failed L108）：
   只补 reason 字段，不重复打
4. **测试结构修正**：`_registered` 注册一次后无法再注册 → duration-null 不能独立成
   测试；改为可变 mock + `exporter.reset()` 并入测试 1（备选 resetModules 双 describe）
5. **覆盖率门槛**（82.72/81.64/78.47/67.9）→ 新增代码必须覆盖：health-state spec
   扩展为必做；落地跑 `pnpm run test:coverage` 验证
6. **日志风格**：模板字符串 key=value（与现有 executor/补偿日志一致），不用对象式
7. **persistence_batch_failed 的 runId**：flushResults 无 runId 参数 → 取 batch 首行
   `pending[0].backtestRunId`（batch 行同属一 run），不改方法签名
8. jest 单文件命令形态确认（`pnpm exec jest <pattern> --runInBand`）

## 8. 收尾顺序（确认后逐步执行）

1. 合并 + push origin/master
2. mock 栈验证 mist 侧（主 worktree 即 master：`bash tools/mock-env/run-mock.sh`）→
   OO（root@example.com:Complexpass#123）`POST /api/default/_search?type=metrics` 微秒
   窗口查 `mist_startup_compensation_total`（outcome=not_enabled，导出链通）
3. tasks 5.2.1–5.2.10 勾选 + 命名注记（`mist_startup_compensation_total` 定案）→ commit 4
4. 生产部署（Deploy Windows Mist Stack）：mist tag=新 master SHA + backtest tag；
   **显式传 productization=shadow**（schema 缓存 422 坑；422 时 set-windows-* 补设）；
   strategy=on 保持
5. 生产 OO（192.168.31.182:5080，root@mist.local）：`mist_backtest_*` 10 指标 +
   `mist_startup_compensation_total` 入库证据 → tasks 注记；日志抽查（docker logs /
   OO 日志流，确认 trace_id）——日志通道落地时确认
6. 归档 extract-backtest-runtime（勾完后 rename-only）

## 9. 风险与注意

- 日志不写单测（review + 部署后抽查验证）；覆盖率靠既有 spec 扩展兜底
- 不动：candle-metrics(.spec)、otel-preload.js、webpack.config.js、`BacktestHealthVo`
  契约、补偿服务逻辑
- spec 微调（本轮 review 已同步进文件）：级别纪律 error/warn 措辞、补偿 failed → error
- 实施中发现 spec 需调整 → 先停下讨论再改

---

## 10. 落地记录（2026-08-10，随执行更新）

- **代码**：4 commits 合 master（6ccd541）+ push；spec delta = extract-backtest-runtime
  specs/backtest-otel-metrics + design §12 + tasks 5.2.1-5.2.9 勾选
- **验证**：typecheck ✅ / lint ✅ / test:ci 151 suites 1243 tests ✅ /
  coverage Lines 83.15≥82.72、Statements 82.11≥81.64、Branches 68.84≥67.9、
  Functions 79.46≥78.47 ✅ / openspec validate ✅ / git diff --check ✅
- **测试落地修正**（self-review 第 2 轮）：
  1. LastValueAggregator 累积语义 → "duration null 无点"不能同 provider 二次收集验证，
     改 `jest.resetModules()` + 动态 `import()` fresh 模块（require 被 eslint 禁）
  2. fresh `@opentelemetry/api` 实例看不到原实例注册的全局 provider（registerGlobal
     拒绝重复注册）→ 必须通过 fresh api `disable()` + `setGlobalMeterProvider`
- **mock 验证**（mock 栈重启后）：`mist_startup_compensation_total` 流出现，
  value=1.0 + outcome=not_enabled（mock 无 handoff 端口，符合预期）✅ 导出链全通
- **生产部署**：run 31364321827 **成功**（1m46s 全绿），mist tag=6ccd541…（prev
  6665770…）、frontend ea4632a0…、datasource fb38428…（prev 043519f…）、
  **productization=shadow 显式传**（lifecycle 输入命中 schema 缓存 422 → 不传，部署
  归一化 off 符合预期）
- **生产 OO 验证 PASSED**（192.168.31.182:5080, root@mist.local）：
  - `mist_backtest_ready`=1、`capacity_total`=8、`active_runs`/`waiting_runs`=0
  - `command_total` 4 点（accepted/queue_full/not_ready/run_failed label 全对）、
    `run_total` 2 点（completed/failed）、`persistence_total` 2 点（success/failure）
  - `mist_startup_compensation_total` value=1 + **outcome='completed'**（生产补偿真实完成）
  - duration/failure/target_issue 无流 = 首个事件前零数据（设计语义，正确）
  - ⚠️ **发现预存缺陷**：otel-preload.js `OTEL_SERVICE_NAME ?? 'mist-backend'` +
    initTelemetry 在 preload 路径被忽略 → 所有 app（backtest/chan/…）生产遥测
    service_name 都是 mist-backend（O1 preload 引入即存在，非本 change 引入）；
    修复 = mist-deploy compose 按服务设 OTEL_SERVICE_NAME（待用户拍板）
- **5.2.10 勾选**：mock 侧（outcome=not_enabled）+ 生产侧（上述证据）——勾选 + 注记
  待 service_name 处置决定后一并提交
