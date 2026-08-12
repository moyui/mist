# OpenSpec 缺口清单（2026-08-11 复核）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。基于 2026-08-11 对
> `openspec/changes/`（proposal/tasks 逐字复核）+ `openspec/specs/`（52 个 spec 契约 vs 代码）
> 的全面盘点。更新任何 change 状态时同步修订本文件。

## 状态速览

- `specs/`：52 个已采纳 spec
- `changes/`：9 个 active change（`archive/` 下 73+ 个已归档）
- 本轮纠正 3 个"误报未完成"（见 §5）

---

## 1. Active changes 精确状态（9 个）

### A. 收尾债（高完成度，近可归档）

| Change | 进度 | 剩余项 | 阻塞/下一步 |
|---|---|---|---|
| `integrate-production-realtime-subscription-lifecycle` | 41/43 | 6.7 源级回滚演练（mode off/镜像回退，不动 migration/assignments/journal/Redis/MySQL 事实）；6.8 全量核对 + strict validation 后归档 | 需 Windows appliance 手动演练窗口 |
| `otel-observability-gaps` | 19/21 | 5.2 生产交易时段验证（TDX/QMT skip 归因 + verdict 可见 + OO 日志回溯）；6.3 归档（--skip-specs） | 等交易时段；无 .openspec.yaml（非 CLI 流程） |
| `add-realtime-subscription-operator-ux` | 19/20 | 4.3 真机联测（**已 Deferred**：需 matched backend contract/image + terminal HIL；前端独立验证已完成） | 随下次真机窗口 |
| `extract-backtest-runtime` | 31/36 | 5.3 三仓完整基线 + 退役路径检索；5.4 真实 MySQL migration pre/postflight + EXPLAIN 门禁；5.5 Windows appliance restart/isolation + TDX/QMT 1m/日线 **quantity HIL**（未证明 profile 前 quantity plan 保持 ineligible）；5.6 部署 cutover（先验收 backtest 再切 RPC-only mist-backend） | 5.2（OTel 指标）实质完成仅差勾选；5.6 受 mist-production 审批保护 |

### B. 进行中 HIL（08-11 交易时段）

| Change | 进度 | 剩余项 |
|---|---|---|
| `fix-tdx-realtime-vwap-window-consistency` | 18/24 | **E-0 全链路实测**（shadow 执行，p95<100ms / 驱逐=0 / 写失败=0 判定；观测帧 → datasource O2a → OO）；E-6 终端负载 + 帧数/假阳性对比复跑；改进项（buildId bump v3.0、QMT health 暴露 bridgeBuildId、Inspect artifacts 加 buildId 比对） |

### C. 延期已解除、待启动（价值闭环最后一步）

| Change | 进度 | 剩余项 |
|---|---|---|
| `deliver-strategy-notifications` | **1/20** | tasks 1.1 勾选（2026-08-07 三条件满足 → 1.2-5.4 解除暂停）。剩余 19 条：评审门禁 2.1-2.6（首批渠道、claim 机制候选、timeout/retry/DDL 语义、AlertEvent schema 是否足够、worker app 拓扑——**全部"向项目负责人评审"，未确认前不得实现 worker/schema/adapter**）→ 实现 3.1-3.4 → 部署监控 4.1-4.3 → HIL 5.1-5.4（真实 MySQL、受控接收端 dry-run/shadow、真实渠道 HIL、归档审阅）。F1（归档时重写 stable Purpose）恢复时重新评估 |

### D. 规划型 / 被动型

| Change | 进度 | 剩余项 |
|---|---|---|
| `define-mist-production-roadmap` | 16/34 | G2 生产运维就绪 7 项（含创建 child `complete-production-operations-readiness`、受控恢复机制选型、认证/审批/回滚语义）；G3 前端 operator console 5 项（child `improve-frontend-operator-console`）；G4 可重复性 6 项（child `tighten-tooling-and-build-repeatability`、处置 ledger 收尾）；最后 strict validation + 归档 |
| `capture-realtime-provider-anomalies` | 0/14 | **被动契约**：等真实 incident 才执行，不阻塞正常路径；禁止 fault injection；四件套齐全；是 TDX/QMT negative branch 的承接方 |
| `remediate-otel-audit-findings` | 0/13 | G1 实质已完成（随 gaps G0 落地）**待核对勾选**；**G2 凭据默认值 / G4 monitoring 处置 = 等用户拍板**；G3 与 gaps A1 重叠待核对 |

---

## 2. Spec 承诺但代码缺失（契约缺口）

| 缺口 | 定性 | 承接 |
|---|---|---|
| 策略告警**主动投递**（worker + channel adapter + retry/dead-letter） | 唯一未实现的闭环环节 | `deliver-strategy-notifications` |
| 监控告警规则 + IM/webhook 投递出口 | `watchdog-alerting` spec 把 alerting 委托给"未来 Alertmanager"；全仓无 wecom/dingtalk/feishu/webhook 代码 | 未创建 O3 change（OO 告警规则）；Alertmanager 未入 Compose 栈 |
| 缠论**段（Duan）**/买卖点 | `ChannelLevel.Duan` 枚举已声明但全仓无算法（代码半成品）；**被采纳的 chan spec 均未规划** | 无 owning change（需新 spec 显式采纳） |
| schedule 定时策略扫描 | `strategy-scheduler-alert-delivery` 契约承诺 schedule 托管 scan jobs，但代码被实时触发路径取代（`/v1/strategy-scans/run` 显式不得注册），**契约从未归档** = spec 遗留债 | 归档时处理 |
| 前端 dashboard 实盘数据 | 仅 mock（`mist-fe/app/dashboard/data/mock.ts`），无 spec 承诺、无后端监控 API 支撑 | roadmap G3（improve-frontend-operator-console） |

---

## 3. 待拍板项

| 项 | 内容 |
|---|---|
| remediate G2 | `OO_OTLP_AUTH_BASE64` 默认值处置（必需项/占位）；`OO_ROOT_USER_PASSWORD` 一并评估 |
| remediate G4 | mist-monitoring 退役标记/README/metrics-overview 对齐 OO 现状（或归档） |
| fix-tdx-vwap E-0 后 | buildId v3.0、QMT health 暴露 buildId（08-11 交易时段 E-0 通过后） |
| D（vwap 3s→1s 轮询）/ C 组 | 明确不做区，需 owner 另行确认 |

---

## 4. 待创建 change（全仓确认不存在）

| Change | 来源 |
|---|---|
| `complete-production-operations-readiness` | roadmap G2.1 |
| `improve-frontend-operator-console` | roadmap G3.1 |
| `tighten-tooling-and-build-repeatability` | roadmap G4.3 |
| O3（OO 告警规则） | otel-observability-gaps proposal（本 change 只提供断流判定信号输入） |

---

## 5. 已确认完成（本轮纠正的误报）

| Change | 证据 |
|---|---|
| `standardize-service-boundary-contracts` | 已归档 30/30；`libs/transport`（@app/transport/http + /rpc）存在 |
| `complete-current-day-realtime-candles` | 已归档 38/38（22+16）；B1 当日 candle 聚合全落地；archive 纯 rename（delta 权威在 archived delta） |
| `run-realtime-strategy-evaluation` | 已归档 29/29；`apps/signal`（TCP 9010 + HTTP 8010 + BullMQ worker）存在；on-HIL PASSED（signals=2 + alert_events=2 事务原子写） |
| `evolve-strategy-evaluation-contract` | 已归档（creation-only 契约冻结）；`extract-market-analysis-kernels` 被 `extract-chan-core` 取代并归档 |

---

## 6. 平台能力总览（已实现基线）

- **数据采集**：TDX/QMT/EastMoney 历史 K + DB 落库（3 provider 策略注册）
- **实时链路**：schema-v2 native-map transport → canonical snapshot → 当日 candle 聚合（shadow 模式）→ BullMQ candle_finalized → apps/signal 评估 → Signal + PENDING AlertEvent 事务写（**on-HIL 已通过**）
- **缠论**：合并K / 分型 / 笔（Phase A/B）/ 中枢（笔级别）；缺段/买卖点
- **策略**：定义注册（creation-only）、声明式规则（gt/lte/crossesAbove + all/any）、KDJ/MACD 指标字段、signal-level 回测（apps/backtest 独立运行时）
- **前端**：K 线 / 策略工作台（registry|signals|alerts|backtests）/ 实时订阅运营页；dashboard 仍 mock
- **部署监控**：13 容器 Compose appliance、OTel + OpenObserve（O0-O2a 全链路）、Go exporter + watchdog
- **AstrBot**：4 skill 通过 `/v1/*` pull 消费（含策略告警轮询回写）
