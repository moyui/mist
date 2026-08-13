# OpenSpec 缺口清单（2026-08-13 复核）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。基于 2026-08-11/08-12 多轮
> 逐字复核（proposal/tasks）+ spec 契约 vs 代码比对。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `specs/`：52 个已采纳 spec
- `changes/`：**5 个 active change**（`archive/` 下 90+ 已归档）
- 08-12 归档大名单（9 个）：remediate-otel-audit-findings、fix-tdx-realtime-vwap-window-consistency
  （E-0 全绿）、otel-observability-gaps（6.3）、decouple-bridge-callback-and-correct-vwap-bounds
  （F4 过：TDX 出界 13%→0.6%）、retire-diagnostic-endpoints（已部署验证）、datasource-logs-to-openobserve、
  declarative-realtime-configuration、windows-openssh-ops-channel、**define-mist-production-roadmap（本会话，G2-G4 处置完毕）**
- 08-13 归档（1 个）：restore-mock-env-candle-assertions（tasks 22/22 + validate 通过；2.3 N/A、6.x 外部完成）

---

## 1. Active changes 精确状态（6 个，2026-08-12 晚）

### A. 收尾债（高完成度）

| Change | 进度 | 剩余项 | 阻塞/下一步 |
|---|---|---|---|
| `integrate-production-realtime-subscription-lifecycle` | 41/43 | 6.7 源级回滚演练（mode off/镜像回退，不动 migration/assignments/journal/Redis/MySQL 事实）；6.8 全量核对 + strict validation 后归档（6.6 注记 "both sources 未完整达成"，QMT 已随 6.5 补验） | 需 Windows appliance 手动演练窗口 |
| `extract-backtest-runtime` | 31/36 | 5.3 三仓完整基线 + 退役路径检索；5.4 真实 MySQL migration pre/postflight + EXPLAIN 门禁；5.5 Windows appliance restart/isolation + TDX/QMT 1m/日线 **quantity HIL**（未证明 profile 前 quantity plan 保持 ineligible）；5.6 部署 cutover（先验收 backtest 再切 RPC-only mist-backend） | 5.2（OTel 指标）实质完成仅差勾选；5.6 受 mist-production 审批保护 |
| `add-realtime-subscription-operator-ux` | 19/20 | 4.3 真机联测（**已 Deferred**：需 matched backend contract/image + terminal HIL；前端独立验证已完成） | 随下次真机窗口 |

### B. 延期已解除、待启动（价值闭环最后一步）

| Change | 进度 | 剩余项 |
|---|---|---|
| `deliver-strategy-notifications` | **1/20** | tasks 1.1 勾选（2026-08-07 三条件满足 → 1.2-5.4 解除暂停）。剩余 19 条：评审门禁 2.1-2.6（首批渠道、claim 机制候选、timeout/retry/DDL 语义、AlertEvent schema 是否足够、worker app 拓扑——**全部"向项目负责人评审"，未确认前不得实现 worker/schema/adapter**）→ 实现 3.1-3.4 → 部署监控 4.1-4.3 → HIL 5.1-5.4 |

### C. 被动 / 新创建

| Change | 进度 | 剩余项 |
|---|---|---|
| `capture-realtime-provider-anomalies` | 0/14 | **被动契约**：等真实 incident 才执行，不阻塞正常路径；禁止 fault injection；TDX/QMT negative branch 的承接方 |

---

## 2. Spec 承诺但代码缺失（契约缺口）

| 缺口 | 定性 | 承接 |
|---|---|---|
| 策略告警**主动投递**（worker + channel adapter + retry/dead-letter） | 唯一未实现的闭环环节 | `deliver-strategy-notifications` |
| 监控告警规则 + IM/webhook 投递出口 | `watchdog-alerting` spec 把 alerting 委托给"未来 Alertmanager"；全仓无 wecom/dingtalk/feishu/webhook 代码；OO 有数据无告警规则 | 未创建 O3 change（OO 告警规则）；Alertmanager 未入 Compose 栈 |
| 缠论**段（Duan）**/买卖点 | `ChannelLevel.Duan` 枚举已声明但全仓无算法（代码半成品）；**被采纳的 chan spec 均未规划** | 无 owning change（需新 spec 显式采纳） |
| schedule 定时策略扫描 | `strategy-scheduler-alert-delivery` 契约承诺 schedule 托管 scan jobs，但代码被实时触发路径取代（`/v1/strategy-scans/run` 显式不得注册），**契约从未归档** = spec 遗留债 | 归档时处理 |
| 前端 dashboard 实盘数据 | 仅 mock（`mist-fe/app/dashboard/data/mock.ts`），无 spec 承诺、无后端监控 API 支撑 | **roadmap G3 deferred**（恢复条件：后端状态契约落地或 owner 明确请求，见归档 roadmap tasks 3.1/3.2） |

---

## 3. 待拍板项（08-12 晚）

| 项 | 内容 |
|---|---|
| decouple **4 个 LOW**（F1-q ~ F4-q） | 已随 change 归档**记录在案待 owner 拍板**：① VWAP clamp 浮点 sub-cent 精度 ② clamp 仅实时 Redis scope（历史 MySQL 保留原始采样带）③ TDX 同 code 连续 tick 重复 fetch ④ TDX 回调静默吞错不对称（QMT 有 bounded 诊断）。建议处置已列在归档 tasks |
| ~~remediate G2/G4~~ | 已处理（change 已归档 08-11） |
| ~~vwap D 组~~ | 已随 fix-tdx 归档（明确不做区） |

---

## 4. 待创建 change

| Change | 来源 | 状态 |
|---|---|---|
| O3（OO 告警规则） | otel-observability-gaps proposal（本 change 只提供断流判定信号输入） | **仍未创建** |
| ~~complete-production-operations-readiness~~ | roadmap G2.1 | **已 superseded**（G2 以运维文档包完成：operations-recovery.md + observability-queries.md + README 重写，mist-deploy e11e5d9） |
| ~~improve-frontend-operator-console~~ | roadmap G3.1 | **已 deferred**（恢复条件见 §2 dashboard 行） |
| ~~tighten-tooling-and-build-repeatability~~ | roadmap G4.3 | **已 dropped**（4.1 四项观察全部不再复现） |

---

## 5. 已确认完成（08-12 归档批次）

| Change | 证据 |
|---|---|
| `define-mist-production-roadmap` | **本会话归档**（2d7a46e）：G2 完成（文档包）、G3 deferred（3.3/3.4 completed）、G4 completed/dropped；validate 65/65 |
| `fix-tdx-realtime-vwap-window-consistency` | E-0 08-11 全绿，08-12 归档 |
| `otel-observability-gaps` | 6.3 归档完成（08-12） |
| `decouple-bridge-callback-and-correct-vwap-bounds` | **F4 08-12 收盘后通过**：TDX 160 桶 3 出界（1 samplingNoise + 2 过渡桶），samplingNoise 13%→0.6%；QMT 46 桶 0 samplingNoise；4 个 LOW 记录待拍板 |
| `retire-diagnostic-endpoints-to-structured-logs` | 08-12 16:00 归档（b106394）：WS 生命周期日志 + /providers + /evidence 404 + 部署脚本清理；QMT_REALTIME_MODE=off 待开盘前恢复 |
| `remediate-otel-audit-findings` | 08-11 归档（10/13 完成态） |
| `standardize-service-boundary-contracts` / `complete-current-day-realtime-candles` / `run-realtime-strategy-evaluation` / `evolve-strategy-evaluation-contract` | 均已归档（误报纠正，见 08-11 复核） |

---

## 6. 悬空引用（记录在案，归档时处置）

| 引用 | 出处 | 事实 |
|---|---|---|
| `repair-chan-bi-overlap-rendering` | roadmap tasks 0.6/1.1 声称"已注册/完成并归档" | **archive 中不存在该 change**；已随 roadmap 归档标注为 G1 证据链断点，待补录 |
| `shrink-monitoring-to-blackbox-probe` | retire proposal 说明"已 DEPRECATED 归档 d467aa1" | 本 openspec 树不可验证（来自已删的 monitoring 仓 openspec） |

---

## 7. 平台能力总览（已实现基线）

- **数据采集**：TDX/QMT/EastMoney 历史 K + DB 落库（3 provider 策略注册）
- **实时链路**：schema-v2 native-map transport → canonical snapshot → 当日 candle 聚合 → BullMQ candle_finalized → apps/signal 评估 → Signal + PENDING AlertEvent 事务写（on-HIL 已通过；TDX vwap 出界率已修正至 0.6%）
- **缠论**：合并K / 分型 / 笔（Phase A/B）/ 中枢（笔级别）；缺段/买卖点
- **策略**：定义注册（creation-only）、声明式规则 + KDJ/MACD 指标字段、signal-level 回测（apps/backtest 独立运行时）
- **前端**：K 线 / 策略工作台 / 实时订阅运营页；dashboard 仍 mock（G3 deferred）
- **部署监控**：12 容器 Compose appliance、**OTel + OpenObserve 统一可观测**（exporter/watchdog/prometheus/grafana 已全部退役）
- **运维**：SSH 直连通道（mist-box）、恢复操作清单 + OO 查询手册（runbooks）、声明式实时配置
- **AstrBot**：4 skill 通过 `/v1/*` pull 消费（含策略告警轮询回写）
