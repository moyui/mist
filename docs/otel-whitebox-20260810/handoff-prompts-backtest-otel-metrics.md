# 交接提示词 — backtest 模块 OTel 监控（extract-backtest 5.2 落地）

> 来源：2026-08-10 主线程（OTel O1/O2a 生产验证后）。
> **本线程职责：给独立 backtest 服务补齐 OTel 指标（OpenObserve 口径），完成
> `extract-backtest-runtime` change 的 task 5.2。**
> 先读：`mist/docs/project-quality-governance-guide.md`（§10 验证清单）、
> `otel-whitebox-20260810/handoff-prompts-otel-o1-o2a-20260810.md`（OTel 已知坑 §三）、
> `mist/apps/mist/src/realtime/observability/candle-metrics.ts`（模式样板）。

---

## 一、背景与目标

Backtest 已抽成独立服务（`apps/backtest`，compose `mist-backtest` 容器，生产运行中）：
- ✅ 已有 traces（OTel foundation `initTelemetry` 已接入全部 5 个 app）
- ❌ **零指标**——run 状态/准入/容量/命令成败/持久化/启动补偿 outcome 全部不可见

08-07 教训（TDX 断流 56 分钟零感知）：服务活着但没指标 = 出事看不见。backtest 现在是同类盲区。
monitoring/exporter/prometheus 已随 OTel 迁移**退役**（compose 已删），**OTel/OpenObserve 是唯一
指标通道**——这就是 5.2 的"OTel 口径"。

**验收标准**：实现后 9 个 `mist_backtest_*` 指标 + 1 个补偿 outcome 指标，在 mock 环境
OpenObserve 可见；单测/契约测试全绿；勾选 tasks 5.2。

## 二、规格（tasks 5.2，已改写为 OTel 口径，2026-08-10 commit 9f0a5c0）

- `[backtest]` `apps/backtest/src/observability/backtest-metrics.ts`：镜像 `candle-metrics.ts`
  模式（`metrics.getMeter('backtest','0.1.0')` + observable gauges，`main.ts` 在 `initTelemetry`
  后注册一次、幂等），低基数：
  `mist_backtest_ready`（scoped readiness）、`mist_backtest_active_runs` /
  `mist_backtest_waiting_runs`（admission）、`mist_backtest_capacity_total`、
  `mist_backtest_command_total{outcome}`、`mist_backtest_run_total{status}`、
  `mist_backtest_duration_seconds`、`mist_backtest_persistence_total{outcome}`、
  `mist_backtest_failure_total{reason}`、`mist_backtest_target_issue_total`。
- `[mist]` 一次性 startup-compensation/lost-ACK outcome 指标（命名实施时定：
  推荐 `mist_startup_compensation_total{outcome}`，备选 tasks 原文 `mist_backtest_lost_ack_total`）。
- `[backtest tests]` `backtest-metrics.spec.ts` 镜像 `candle-metrics.spec.ts`：注册幂等、
  gauge 值反映进程内状态、低基数 label 断言。
- `[mist tests]` compensation outcome 指标单测。
- 验证：mock 环境（tools/mock-env）OpenObserve 可见 `mist_backtest_*`。
- Backtest health 与 command outcomes 已实现；本任务只补指标导出层。

## 三、实施计划（已确认的文件级方案）

**新建 4 文件 + 2 个 main.ts 各加一行注册，零业务逻辑改动**（纯只读指标派生）：

| 文件 | 内容 |
|---|---|
| `apps/backtest/src/observability/backtest-metrics.ts` | `registerBacktestMetrics(...)`：读 backtest 服务状态 → 9 个 observable gauges。数据源：`backtest-health-state.service`（ready）、`backtest-admission.service`（active/waiting/capacity）、`backtest-run.executor`（run status/duration/persistence/failure）、`backtest-startup.service`（startup reconciliation）、command 计数（`backtest-command.controller`/admission）。**逐个确认计数来源**；缺只读口则加只读 snapshot 方法（不改行为） |
| `apps/backtest/src/main.ts` | `initTelemetry` 后 DI 解析 → `registerBacktestMetrics(...)` |
| `apps/backtest/src/observability/backtest-metrics.spec.ts` | 镜像 candle-metrics.spec（幂等/值/label 低基数） |
| `apps/mist/src/realtime/observability/startup-compensation-metrics.ts` | 读 `realtime-strategy-startup-compensation.service.ts` 的 `snapshot()`（outcome/submitted）→ gauge。**不改补偿服务本身** |
| `apps/mist/src/main.ts` | 注册补偿指标（1 行） |
| `apps/mist/.../startup-compensation-metrics.spec.ts` | outcome 指标单测 |

**模式参考**（candle-metrics.ts 结构）：`let _registered = false` 幂等 flag →
`metrics.getMeter(name, '0.1.0')` → `createObservableGauge(name, {description}).addCallback(
(result) => result.observe(值, {低基数label}))`；`main.ts` 在 `initTelemetry(...)` 之后调用。

## 四、OTel 已知坑（O1 线程踩过，必读）

1. **preload**：bundle 启动必须 `node -r ./otel-preload.js`（compose 已配好，不要动 Dockerfile CMD）。
2. **@opentelemetry/api 必须 webpack external**（webpack.config.js 已配，勿改）。
3. **startActiveSpan 2.x 不再自动 end**——本任务用 observable gauge 无 span 问题，但若加 span 必须手动 end。
4. **pino 打进 bundle 无法被 instrumentation-pino patch**——本任务不涉及。
5. 指标注册必须在 `initTelemetry` 之后（meter provider 就绪），幂等（重复注册会重复 callback）。

## 五、分支与验证

- **分支**：`feat/backtest-otel-metrics`，从 mist master（`9f0a5c0`）创建（worktree 隔离，
  主 worktree 留 master；`git -C` 操作，勿裸 cd）。
- **本地验证**：`pnpm typecheck`、`pnpm lint:check`、`env TZ=UTC pnpm run test:ci`
  （**带 `--forceExit`**——mist CI 挂死教训）、`openspec validate --changes`。
- **mock 验证**：`mist-datasource/tools/mock-env/` 起栈 → OO（mock 凭据
  <MOCK_USER_REDACTED>:<MOCK_PASSWORD_REDACTED>）查询 `mist_backtest_*` 指标入库
  （`POST /api/default/_search?type=metrics`，微秒时间窗口）。
- **完成后**：勾 tasks 5.2（附 mock/单测证据）→ 合 master → 部署后生产 OO 可见性确认
  （部署方式见 O1 handoff §六；**必传 productization=shadow**，schema 缓存 422 时用
  set-windows-* 补设）。

## 六、约束

- **零业务逻辑改动**：指标全部从现有状态/snapshot 派生；需新只读口时加只读方法。
- 低基数 label（reason/outcome/status 枚举有界）；`_total` 后缀合规。
- 命名争议点（`mist_backtest_lost_ack_total` vs `mist_startup_compensation_total`）：
  推荐后者（补偿是 mist 的机制不是 backtest 的），定了就写进 tasks 注记。
- 三步工作流：spec（已改）+ 实施计划（本节）+ 落地（本线程）——若实施中发现 spec 需调整，
  **先停下讨论**再改。
- 相关文件勿动：candle-metrics（O1 已归档）、otel-preload.js/webpack.config.js（已配好）。
