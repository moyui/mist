# Mist 运行时与可观测性治理指南

状态：Living guide
适用范围：realtime、worker、queue、cache、provider gateway、health、metrics、alerts、deployment 和 HIL

## 1. 目的

本指南提炼 Mist runtime specs 中跨功能反复成立的可靠性规则。具体 queue 名、timeout 数值、Redis key、
provider method、mode 和 app topology 仍由 owning stable spec 或已确认 active change 管理。

主要来源包括：`datasource-runtime-safety`、`monitoring-health-alerts`、
`realtime-market-data-ingress`、`realtime-source-layout`、`strategy-runtime-architecture`、
`release-ci-safety`、`mist-production-baseline`、`windows-docker-appliance` 和
`review-remediation-governance`。

## 2. 单一 owner 与单向依赖

每个运行时职责必须有一个明确 owner：

```text
market transport/state
  → analysis/context
  → evaluation/persistence
  → notification delivery
```

- 上游 market/analysis 不依赖 strategy/notification。
- notification adapter 不执行策略，也不拥有 Signal 业务状态。
- public API owner、后台 execution owner 和 delivery owner 可以是不同 app，但不得重复写同一状态。
- 复用逻辑先抽到 approved shared library；一个 app 不 import 另一个 app 的内部 source。
- repository split 发生在 module/library 边界稳定之后，不用新仓库掩盖 owner 不清。

## 3. 故障域与提交边界

- 单个 frame、job、provider command 或 notification 失败不得无边界终止长期运行进程。
- catch 不能把失败改写成成功；最终 boundary 必须记录 failure state、metric 或安全日志。
- 已提交上游事实不因下游失败回滚：例如 market state 提交后，queue/strategy/notification 失败由各自
  owner 收口。需要共同成功的数据库不变量则使用短事务。
- service startup failure、runtime item failure 和 operator-controlled `off` 是不同状态。
- automatic recovery 不得由一个模糊 error code 或 readiness 字段触发。

## 4. 有界资源与可取消 I/O

新增运行时集合或循环时，必须定义：

| 资源 | 必须定义 |
|---|---|
| queue/pending map/cache | global/per-key 上限、拒绝或丢弃语义、清理时机 |
| retained result/journal/log | count、age、bytes、rotation/retention |
| incoming frame | raw bytes、JSON depth、field count、symbol/item count |
| outbound broadcast | connection snapshot、send timeout、bounded concurrency |
| database replay/query | stable order、page/cursor、limit、deadline、pool budget |
| worker/job | concurrency、overall deadline、stage timeout、shutdown cleanup |

blocking native SDK 调用不能直接运行在 asyncio/event-loop handler。锁内只维护必要状态，网络发送和
阻塞操作在锁外执行。

每个外部 I/O 使用其 client/driver 真正支持的 timeout/cancellation。整轮 deadline 不能用无法取消底层
操作的 `Promise.race` 伪造。

## 5. Retry、幂等与恢复

- retry、backoff、dead-letter、manual replay 和 reconciliation 都需要唯一 owner。
- 实施前必须证明：可识别错误类别、幂等 identity、次数、deadline、资源预算、监控和最终状态。
- provider latest-state snapshot 默认不能推导 exactly-once、replay 或 backfill。
- lost response 优先依靠持久 identity、条件更新和一次必要 readback，不盲目重复写。
- 无权威 postcondition 时保持 `unknown`，不能从 silence、heartbeat 或相邻任务成功推导完成。
- 未经 focused change 评审，不应为了覆盖异常分支而修改 production artifact；真实 incident 和
  deterministic test 必须分别记录。

## 6. Realtime 边界

- 在高成本 parse 前限制原始 frame bytes；同一 process boundary 只 parse 一次。
- source-native converter 分别 fail closed，再进入共同 canonical ingress。
- 单个非法 entry 可以被隔离，但不得把非法非空批次伪装成完整成功。
- accepted transport 不自动授权 persistence、K aggregation、strategy 或 notification side effect；每个
  sink 由独立 productization change 明确。
- history、current-K、latest snapshot 和 tick event 是不同数据语义，不因字段重合而合并。
- 时间乱序、重复、跨日、午休、断连、重连和 owner generation 都要有明确处理和清理测试。
- mode 默认值、shadow/on gate 和 rollback state 由 source/feature owner 定义；不得静默切换。

## 7. Health、readiness 与 metrics

### 7.1 分层健康

健康模型至少区分：

| 层 | 示例表达 |
|---|---|
| process/service | root `status` |
| transport | `connected` / `transportReady` |
| terminal owner | `bridge.ready`、owner identity/generation |
| subscription/control | source-specific component state |
| data freshness | last accepted event/snapshot time |
| product consumer | queue/window/evaluation/delivery state |

root health 绿色不能证明 terminal owner、订阅、数据新鲜度或业务闭环。`off` 是 operator-controlled
状态，不等于 ordinary healthy，也不等于 transport failure。

### 7.2 指标

- metric family 提供稳定 HELP/TYPE metadata。
- label 只使用 bounded enum/code；provider symbol、owner ID、path、token、异常文本和高基数业务 ID
  不进入 label。
- reason code 是稳定有限集合，free-form detail 进入 bounded diagnostics/log。
- monitoring 只声明直接观察到的事实，不把 bridge-local loss、callback silence 或另一层 readiness
  推断成成功/失败。
- probe failure、notification failure 和 component-down 分开观测。
- HTTP probe/webhook 继承 caller context，有有限 timeout 且可取消。

## 8. 部署与发布

- 每个新增 service 同步 Compose、env example/defaults、目录初始化、启动顺序、health、diagnostics、
  monitoring、rollback 和 CI contract test。
- production image tag 使用明确 commit SHA；部署记录 last-known-good tag。
- database migration 是应用健康前的显式步骤，并有备份和 readback。
- diagnostics failure 不得阻止 rollback；诊断采集与回滚控制流分离。
- source-scoped 变更只重启受影响 source；routing clue 不自动授权整栈重部署。
- terminal bridge artifact 的安装、reload、路径和 SHA-256 独立验收，container deploy 不能替代。
- release publishing 需要 repository validation 和受保护环境审批；本地 `.env` 不进入 Git。

## 9. HIL 与证据

自动化证明 contract 和确定性逻辑，HIL 证明真实环境行为。涉及 terminal/provider/Windows/session 的
能力至少记录：

- 所有相关 repository SHA 和 image tag；
- 实际 terminal bridge path、SHA-256、build/owner identity；
- 真实 native/provider sample 与时间窗；
- restart、stale owner/generation fencing、rollback；
- protected table/data digest invariance；
- success、failure、out-of-session、跳过、unknown 和环境阻塞的明确区分；
- 证据脱敏、hash 和 retention。

CI、mock、route 200、非交易时段无数据或根 health 绿色都不能单独证明严格 realtime HIL。

## 10. 审查清单

- [ ] 每个 state、queue、worker、metric 和 recovery action 有唯一 owner。
- [ ] 上游事实与下游副作用的提交/失败边界明确。
- [ ] collection、payload、queue、retention、query 和 concurrency 全部有界。
- [ ] blocking work 不占用 event loop，锁内不做网络发送。
- [ ] timeout/deadline 使用真实可取消机制。
- [ ] retry/recovery/dead-letter 有幂等、上限、监控和最终状态。
- [ ] service、transport、owner、subscription、freshness 和 product readiness 分层。
- [ ] metric labels 低基数且不含 secret/free-form text。
- [ ] `off`、degraded、failure 和 unavailable 没有混用。
- [ ] Compose/env/health/monitoring/diagnostics/rollback/CI 同步。
- [ ] HIL 记录真实 artifact identity、时间窗、restart/rollback 和 protected-data evidence。
- [ ] 验证报告没有把环境阻塞、跳过项、unknown 或 mock 描述成生产通过。
