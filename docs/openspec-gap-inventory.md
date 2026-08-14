# OpenSpec 缺口清单（2026-08-14 复核）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。基于多轮逐字复核
> （proposal/tasks）+ spec 契约 vs 代码比对。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `specs/`：52 个已采纳 spec
- `changes/`：**10 个 active change**（`archive/` 下 90+ 已归档；其中 5 个属其他线程
  活跃：add-chan-duan-segment / add-chan-duan-channel / add-chan-divergence /
  extract-shared-indicators-library / migrate-stack-to-linux-node-with-ssh-tunnel，
  本清单不重复维护其明细）
- **价值闭环已打通**（2026-08-13）：`deliver-strategy-notifications` 归档 —— 实时K→信号→PENDING→QQ/微信投递链全通
- 08-14 归档（1 个）：**remediate-alert-delivery-integrity**（40/40，10.4 无触发=正常
  验证通过 + 规则 A1-A6 在位；change 目录曾 untracked 已随归档提交，push 3867f50c）
- 08-13 归档（3 个）：restore-mock-env-candle-assertions（22/22）、**deliver-strategy-notifications**（21/21，价值闭环）、fixed-point-candle-arithmetic（16/16，F1-q 系统化定点门禁）
- 08-13 新 change（1 个）：**fix-tdx-historical-amount-unit**（已完成+已部署 87f37d22：k 表 tdx amount 万元→元 migration 019 + 写入层 Decimal8 ×10000；backtest 5.5 quantity HIL 的 TDX profile 前置；待归档窗口）
- 08-12 归档（9 个）：remediate-otel-audit-findings / fix-tdx（E-0 全绿）/ otel-gaps（6.3）/ decouple（F4 过 13%→0.6%）/ retire-diagnostic / datasource-logs / declarative-realtime / windows-openssh / **define-mist-production-roadmap**（G2-G4 处置）

---

## 1. Active changes 精确状态（本清单跟踪 5 个，2026-08-14）

### A. 收尾债（高完成度）

| Change | 进度 | 剩余项 | 阻塞/下一步 |
|---|---|---|---|
| `integrate-production-realtime-subscription-lifecycle` | 41/43 | 6.7 源级回滚演练（mode off/镜像回退，不动 migration/assignments/journal/Redis/MySQL 事实）；6.8 全量核对 + strict validation 后归档（6.6 注记 "both sources 未完整达成"，QMT 已随 6.5 补验） | **已推迟**（08-13 用户拍板：修复批部署 + 稳定观察后再演练；与 backtest 5.5 同窗口） |
| `extract-backtest-runtime` | 33/36 | 5.3/5.4 已完成（08-13：三仓基线 + 隔离 mysql:8.4 跑 016 pre/postflight/EXPLAIN/readback，抓修 2 readback bug e11edbe）；剩 **5.5 Windows appliance restart/isolation + TDX/QMT 1m/日线 quantity HIL** + **5.6 部署 cutover**（受 mist-production 审批保护） | **5.5 已推迟**（08-13 用户拍板，三阻塞：① restart-isolation HIL 前置要求"重启时源无订阅"与生产不符 ② TDX amount 万元已由 fix-tdx-historical-amount-unit 修复（019）③ TDX 1m/QMT 历史数据不足——收盘同步未上线；与 6.7 同窗口）；5.6 审批 |
| `add-realtime-subscription-operator-ux` | 19/20 | 4.3 真机联测（**已 Deferred**：需 matched backend contract/image + terminal HIL；前端独立验证已完成） | 随下次真机窗口 |

### B. 被动

| Change | 进度 | 剩余项 |
|---|---|---|
| `capture-realtime-provider-anomalies` | 0/14 | **被动契约**：等真实 incident 才执行，不阻塞正常路径；禁止 fault injection；TDX/QMT negative branch 的承接方 |
| `fix-tdx-historical-amount-unit` | 14/14 | 08-13 完成+已部署（87f37d22）：k 表 tdx amount 万元→元（migration 019 + 写入层 Decimal8 ×10000，600519 73.7 亿验证）；**backtest 5.5 TDX amount profile 前置**；待归档（与统一归档窗口） |

---

## 2. Spec 承诺但代码缺失（契约缺口）

| 缺口 | 定性 | 承接 |
|---|---|---|
| 监控告警规则 + IM/webhook 投递出口 | `watchdog-alerting` spec 把 alerting 委托给"未来 Alertmanager"；全仓无基础设施告警出口（**策略告警已通**，缺的是"服务挂了谁通知"） | 未创建 O3 change（OO 告警规则）；Alertmanager 未入 Compose 栈 |
| 缠论**段（Duan）**/买卖点 | `ChannelLevel.Duan` 枚举已声明但全仓无算法（代码半成品）；**被采纳的 chan spec 均未规划** | 无 owning change（需新 spec 显式采纳） |
| 前端 dashboard 实盘数据 | 仅 mock（`mist-fe/app/dashboard/data/mock.ts`），无 spec 承诺、无后端监控 API 支撑 | **roadmap G3 deferred**（恢复条件：后端状态契约落地或 owner 明确请求） |

> ~~策略告警主动投递~~ → **已完成**（deliver 归档，apps/notification + QQ/微信 adapter + BullMQ + migration 018）
> ~~schedule 定时策略扫描契约~~ → **已修**（8554702：live spec 改写，schedule-scan-owner 语义已移除）

---

## 3. 待拍板项（08-13）

| 项 | 内容 |
|---|---|
| **F3-q（TDX 同 code 连续 tick 重复 fetch）** | decouple 归档时记录的 LOW；**今晚压力测试再议**。其余 3 个 LOW 已处置：F1-q 系统化（fixed-point 定点门禁）、F2-q 关闭、F4-q 已修 |
| ~~remediate G2/G4~~ | 已处理（08-11 归档） |
| ~~vwap D 组~~ | 已随 fix-tdx 归档（明确不做区） |

---

## 4. 待创建 change

| Change | 来源 | 状态 |
|---|---|---|
| O3（OO 告警规则） | otel-observability-gaps proposal（本 change 只提供断流判定信号输入） | **仍未创建** |
| ~~complete-production-operations-readiness~~ | roadmap G2.1 | **已 superseded**（G2 以运维文档包完成：operations-recovery.md + observability-queries.md + README 重写，mist-deploy e11e5d9） |
| ~~improve-frontend-operator-console~~ | roadmap G3.1 | **已 deferred**（恢复条件见 §2 dashboard 行） |
| ~~tighten-tooling-and-build-repeatability~~ | roadmap G4.3 | **已 dropped**（四项观察全部不再复现） |

---

## 5. 已确认完成（08-12/08-13 归档批次）

| Change | 证据 |
|---|---|
| **`deliver-strategy-notifications`** | **08-13 归档（21/21）—— 价值闭环打通**：apps/notification worker + QQ/微信 channel adapter + BullMQ `strategy-alert-delivery` queue + migration 018 per-channel 投递表 + at-least-once 幂等 + dead-letter + replay 端点；生产积压 16 条 PENDING 告警可投递 |
| `fixed-point-candle-arithmetic` | 08-13 归档（16/16，18962b2）：candle 链定点化门禁（amount/volume 定点计算后留 2 位）；F1-q 系统化、F2-q 关闭、F4-q 已修 |
| `restore-mock-env-candle-assertions` | 08-13 归档（22/22）：mock candle 断言改 OO 证据源；帧新鲜度 30s 硬判删除 |
| `define-mist-production-roadmap` | 08-12 归档（2d7a46e）：G2 完成（文档包）、G3 deferred、G4 关闭 |
| `fix-tdx-realtime-vwap-window-consistency` | E-0 08-11 全绿，08-12 归档（出界率修正至 0.6%） |
| `decouple-bridge-callback-and-correct-vwap-bounds` | F4 08-12 过；TDX 出界 13%→0.6% |
| `retire-diagnostic-endpoints-to-structured-logs` | 08-12 归档（b106394）：WS 生命周期日志 + 诊断端点下线 |
| `otel-observability-gaps` / `remediate-otel-audit-findings` | 08-12/08-11 归档 |
| `standardize-service-boundary-contracts` / `complete-current-day-realtime-candles` / `run-realtime-strategy-evaluation` / `evolve-strategy-evaluation-contract` | 均已归档（08-11 误报纠正） |

---

## 6. 悬空引用（记录在案）

| 引用 | 出处 | 事实 |
|---|---|---|
| ~~`repair-chan-bi-overlap-rendering`~~ | roadmap tasks 0.6/1.1 | **已补录**（8554702：archive/2026-07-10- 记录式归档，git 历史证据） |
| `shrink-monitoring-to-blackbox-probe` | retire proposal 说明"已 DEPRECATED 归档 d467aa1" | 本 openspec 树不可验证（来自已删的 monitoring 仓 openspec） |

---

## 7. 平台能力总览（已实现基线，08-13）

- **数据采集**：TDX/QMT/EastMoney 历史 K + DB 落库（3 provider 策略注册）
- **实时链路（闭环已通）**：schema-v2 native-map transport → canonical snapshot → 当日 candle 聚合（定点化）→ BullMQ candle_finalized → apps/signal 评估 → Signal + PENDING AlertEvent 事务写 → **apps/notification 投递（QQ/微信）**
- **缠论**：合并K / 分型 / 笔（Phase A/B）/ 中枢（笔级别）；缺段/买卖点
- **策略**：定义注册（creation-only）、声明式规则 + KDJ/MACD 指标字段、signal-level 回测（apps/backtest 独立运行时）
- **前端**：K 线 / 策略工作台 / 实时订阅运营页；dashboard 仍 mock（G3 deferred）
- **部署监控**：12 容器 Compose appliance、**OTel + OpenObserve 统一可观测**（exporter/watchdog/prometheus/grafana 已全部退役）；基础设施告警出口未实现
- **运维**：SSH 直连通道（mist-box）、恢复操作清单 + OO 查询手册（runbooks）、声明式实时配置
- **通知**：QQ via NapCat OneBot + 企业微信 webhook（apps/notification worker，at-least-once + dead-letter）
