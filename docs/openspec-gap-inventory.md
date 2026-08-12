# OpenSpec 缺口清单（2026-08-12 复核）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。基于 2026-08-11 与 2026-08-12
> 两轮对 `openspec/changes/`（proposal/tasks 逐字复核）+ `openspec/specs/`（52 个 spec 契约 vs 代码）
> 的全面盘点。更新任何 change 状态时同步修订本文件。

## 状态速览

- `specs/`：52 个已采纳 spec
- `changes/`：**10 个 active change**（`archive/` 下 90+ 个已归档）
- 08-12 变化：`remediate-otel-audit-findings` 已归档；新增 `decouple-bridge-callback-and-correct-vwap-bounds` + `retire-diagnostic-endpoints-to-structured-logs`；`fix-tdx` E-0 通过可归档；archive 新增 datasource-logs / declarative-realtime / windows-openssh

---

## 1. Active changes 精确状态（10 个，2026-08-12）

### A. 收尾债（高完成度，近可归档）

| Change | 进度 | 剩余项 | 阻塞/下一步 |
|---|---|---|---|
| `otel-observability-gaps` | 20/21 | 仅 6.3 归档（--skip-specs；live specs 已含 O1/O2a 子 spec）。5.2 生产验证已勾但内嵌注记 **QMT 侧待 QMT 数据流恢复后补**（08-11 QMT 断流中） | 等 QMT 侧补验 + 归档；无 .openspec.yaml（非 CLI 流程） |
| `fix-tdx-realtime-vwap-window-consistency` | 22/24 | **头部自标"可归档"**：E-0 实测 08-11 交易时段全绿；剩余 2 项 = C2 组（已被 decouple 方案取代，作废标记）+ buildId 改进项（已被 decouple A6/B5 吸收） | 直接归档 |
| `add-realtime-subscription-operator-ux` | 19/20 | 4.3 真机联测（**已 Deferred**：需 matched backend contract/image + terminal HIL；前端独立验证已完成） | 随下次真机窗口 |
| `integrate-production-realtime-subscription-lifecycle` | 41/43 | 6.7 源级回滚演练（mode off/镜像回退，不动 migration/assignments/journal/Redis/MySQL 事实）；6.8 全量核对 + strict validation 后归档（6.6 注记 "both sources 未完整达成"，QMT 已随 6.5 补验） | 需 Windows appliance 手动演练窗口 |
| `extract-backtest-runtime` | 31/36 | 5.3 三仓完整基线 + 退役路径检索；5.4 真实 MySQL migration pre/postflight + EXPLAIN 门禁；5.5 Windows appliance restart/isolation + TDX/QMT 1m/日线 **quantity HIL**（未证明 profile 前 quantity plan 保持 ineligible）；5.6 部署 cutover（先验收 backtest 再切 RPC-only mist-backend） | 5.2（OTel 指标）实质完成仅差勾选；5.6 受 mist-production 审批保护 |

### B. 进行中 HIL（08-12 最活跃）

| Change | 进度 | 剩余项 |
|---|---|---|
| `decouple-bridge-callback-and-correct-vwap-bounds` | 29/31 | **F4 生产 vwap 复跑**（08-12 开盘数据积累后，修正后理论出界率 0）+ F1 mock 回放（等 mock 环境重整）；**4 个 LOW finding 待 owner 拍板**（vwap clamp 浮点 sub-cent / clamp 仅实时 Redis scope / TDX 同 code 连续 tick 重复 fetch / TDX 回调静默吞错不对称）。四件套齐全 + implementation-plan；承接 fix-tdx 方案 B/E 重构（回调 thin 队列化 deque(maxlen=1000)，wire 不变，buildId bump v3.0）+ vwap 反向修正（seal 路径 vwap=amount/volume 兜底 high/low） |

### C. 延期已解除、待启动（价值闭环最后一步）

| Change | 进度 | 剩余项 |
|---|---|---|
| `deliver-strategy-notifications` | **1/20** | tasks 1.1 勾选（2026-08-07 三条件满足 → 1.2-5.4 解除暂停）。剩余 19 条：评审门禁 2.1-2.6（首批渠道、claim 机制候选、timeout/retry/DDL 语义、AlertEvent schema 是否足够、worker app 拓扑——**全部"向项目负责人评审"，未确认前不得实现 worker/schema/adapter**）→ 实现 3.1-3.4 → 部署监控 4.1-4.3 → HIL 5.1-5.4（真实 MySQL、受控接收端 dry-run/shadow、真实渠道 HIL、归档审阅）。F1（归档时重写 stable Purpose）恢复时重新评估 |

### D. 规划型 / 被动型 / 新创建

| Change | 进度 | 剩余项 |
|---|---|---|
| `define-mist-production-roadmap` | 16/34 | G2 生产运维就绪 7 项（含创建 child `complete-production-operations-readiness`、受控恢复机制选型、认证/审批/回滚语义）；G3 前端 operator console 5 项（child `improve-frontend-operator-console`）；G4 可重复性 6 项（child `tighten-tooling-and-build-repeatability`、处置 ledger 收尾）；最后 strict validation + 归档 |
| `capture-realtime-provider-anomalies` | 0/14 | **被动契约**：等真实 incident 才执行，不阻塞正常路径；禁止 fault injection；四件套齐全；是 TDX/QMT negative branch 的承接方 |
| `retire-diagnostic-endpoints-to-structured-logs` | **0/22** | **08-12 新创建，未启动**：WS transport 生命周期结构化日志（TDX+QMT 对称 7 事件点）+ 下 `GET /providers` + `/tdx/bridge/evidence/{symbol}` 迁日志后下 + mist-deploy stale 引用清理（含 MetricsUrl:9109）；**缺 implementation-plan.md（仍在三步工作流第 1 步）**；依赖 gaps B1 日志通道（零新基建）；D6 已执行 monitoring 仓退役 |

---

## 2. Spec 承诺但代码缺失（契约缺口）

| 缺口 | 定性 | 承接 |
|---|---|---|
| 策略告警**主动投递**（worker + channel adapter + retry/dead-letter） | 唯一未实现的闭环环节 | `deliver-strategy-notifications` |
| 监控告警规则 + IM/webhook 投递出口 | `watchdog-alerting` spec 把 alerting 委托给"未来 Alertmanager"；全仓无 wecom/dingtalk/feishu/webhook 代码 | 未创建 O3 change（OO 告警规则）；Alertmanager 未入 Compose 栈 |
| 缠论**段（Duan）**/买卖点 | `ChannelLevel.Duan` 枚举已声明但全仓无算法（代码半成品）；**被采纳的 chan spec 均未规划** | 无 owning change（需新 spec 显式采纳） |
| schedule 定时策略扫描 | `strategy-scheduler-alert-delivery` 契约承诺 schedule 托管 scan jobs，但代码被实时触发路径取代（`/v1/strategy-scans/run` 显式不得注册），**契约从未归档** = spec 遗留债 | 归档时处理 |
| 前端 dashboard 实盘数据 | 仅 mock（`mist-fe/app/dashboard/data/mock.ts`），无 spec 承诺、无后端监控 API 支撑 | roadmap G3（improve-frontend-operator-console） |

## 3. 待拍板项（08-12 更新）

| 项 | 内容 |
|---|---|
| decouple 质量审查 **4 个 LOW** | ① vwap clamp 浮点 sub-cent ② clamp 仅实时 Redis scope ③ TDX 同 code 连续 tick 重复 fetch ④ TDX 回调静默吞错不对称（F1-q ~ F4-q，待 owner 拍板处置） |
| vwap 明确不做区（fix-tdx D 组） | 3s→1s 轮询、量额必填化 —— 已随 fix-tdx 收尾归档，若未来需要另行确认 |
| ~~remediate G2/G4~~ | **已处理**：D2 拍板 `OO_OTLP_AUTH_BASE64` 必需项/占位；D4 monitoring 退役已由 retire D6 执行 → change 已归档 |

## 4. 待创建 change（全仓确认不存在）

| Change | 来源 |
|---|---|
| `complete-production-operations-readiness` | roadmap G2.1 |
| `improve-frontend-operator-console` | roadmap G3.1 |
| `tighten-tooling-and-build-repeatability` | roadmap G4.3 |
| O3（OO 告警规则） | otel-observability-gaps proposal（本 change 只提供断流判定信号输入） |

## 5. 已确认完成（含本轮纠正的误报）

| Change | 证据 |
|---|---|
| `standardize-service-boundary-contracts` | 已归档 30/30；`libs/transport`（@app/transport/http + /rpc）存在 |
| `complete-current-day-realtime-candles` | 已归档 38/38（22+16）；B1 当日 candle 聚合全落地；archive 纯 rename（delta 权威在 archived delta） |
| `run-realtime-strategy-evaluation` | 已归档 29/29；`apps/signal`（TCP 9010 + HTTP 8010 + BullMQ worker）存在；on-HIL PASSED（signals=2 + alert_events=2 事务原子写） |
| `evolve-strategy-evaluation-contract` | 已归档（creation-only 契约冻结）；`extract-market-analysis-kernels` 被 `extract-chan-core` 取代并归档 |
| `remediate-otel-audit-findings` | **08-11 归档**（10/13 完成态）：G1/G3/G5 随 gaps 完成，G2/G4 已拍板处理；归档时收尾三步项未勾（流程标记） |
| `fix-tdx-realtime-vwap-window-consistency` | **E-0 08-11 全绿，头部自标"可归档"**（等归档动作）；实现被 decouple 继承演进 |

## 6. 悬空引用（记录在案，归档时处置）

| 引用 | 出处 | 事实 |
|---|---|---|
| `repair-chan-bi-overlap-rendering` | roadmap tasks 0.6/1.1 声称"已注册/完成并归档" | **archive 中不存在该 change**（全 openspec 树 grep 仅 roadmap 自身出现） |
| `shrink-monitoring-to-blackbox-probe` | retire proposal 说明"已 DEPRECATED 归档 d467aa1" | 本 openspec 树不可验证（来自已删的 monitoring 仓 openspec） |

---

## 6. 平台能力总览（已实现基线）

- **数据采集**：TDX/QMT/EastMoney 历史 K + DB 落库（3 provider 策略注册）
- **实时链路**：schema-v2 native-map transport → canonical snapshot → 当日 candle 聚合（shadow 模式）→ BullMQ candle_finalized → apps/signal 评估 → Signal + PENDING AlertEvent 事务写（**on-HIL 已通过**）
- **缠论**：合并K / 分型 / 笔（Phase A/B）/ 中枢（笔级别）；缺段/买卖点
- **策略**：定义注册（creation-only）、声明式规则（gt/lte/crossesAbove + all/any）、KDJ/MACD 指标字段、signal-level 回测（apps/backtest 独立运行时）
- **前端**：K 线 / 策略工作台（registry|signals|alerts|backtests）/ 实时订阅运营页；dashboard 仍 mock
- **部署监控**：13 容器 Compose appliance、OTel + OpenObserve（O0-O2a 全链路）、Go exporter + watchdog
- **AstrBot**：4 skill 通过 `/v1/*` pull 消费（含策略告警轮询回写）
