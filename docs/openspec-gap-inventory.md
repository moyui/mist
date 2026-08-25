# OpenSpec 缺口清单（2026-08-25 修订，基线 08-25）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `specs/`：**69 个已采纳 spec**（新增 `pre-market-health-inspection`、`trading-timeline-governance`）
- `changes/`：**2 个 active change**（`capture-realtime-provider-anomalies` 待被动触发；`track-remaining-work` 全量追踪）
- **全链路价值闭环与主动治理就绪**（2026-08-25）：
  - 09:05 盘前主动体检与全绿/异常诊断简报打通（`add-reconciliation-blocked-alert` 归档）
  - 实时K→信号→PENDING→QQ/微信投递链全通
  - 缠论买卖点实时与回测求值均已落地归档（08-24）
  - 收盘后权威同步与晨间兜底均已落地归档（08-24）
- **平台基建成熟**：Backtest 独立运行时拆分已归档（08-24）；订阅生命周期与操作台已归档（08-24）；Linux 迁移已明确放弃

---

## 1. 可归档（0 个）

`add-reconciliation-blocked-alert` 已于 08-25 归档，当前无可归档 change。

---

## 2. 被动 / 等待真实场景（1 个）

| Change | 进度 | 状态与说明 |
|---|---|---|
| `capture-realtime-provider-anomalies` | 13/14 | 被动契约：只读采集器/脱敏/Runbook/Workflow 均已就绪（13 项全绿），§4.3 等首个真实 incident 自然发生后复盘，不阻塞正常发布 |

---

## 3. 全局追踪（1 个）

| Change | 状态 | 职责 |
|---|---|---|
| `track-remaining-work` | active | 全量剩余工作与跨环境 HIL 状态追踪 |

---

## 4. 近期归档（08-24 ~ 08-25）

| 日期 | Change | 内容与进度 |
|---|---|---|
| **08-25** | `add-reconciliation-blocked-alert` | 16/16：09:05 盘前主动体检诊断简报、A10 QMT Journal 阻塞告警、@app/timezone 调度与窗口收敛 |
| **08-24** | `sync-post-close-market-data` | 6.5/6.5：22:30/06:30 收盘后多周期权威同步与晨间兜底 |
| **08-24** | `add-chan-bsp-backtest-evaluation` | 22/22：缠论一二三类买卖点回测运行时与事件发射 |
| **08-24** | `add-chan-bsp-realtime-evaluation` | 缠论一二三类买卖点实时求值与信号集成 |
| **08-24** | `extract-backtest-runtime` | 27/27：回测独立运行时拆分与 TCP RPC 客户端 |
| **08-24** | `integrate-production-realtime-subscription-lifecycle` | 43/43：生产订阅生命周期管理与 09:15 权威对账 |
| **08-24** | `add-realtime-subscription-operator-ux` | 20/20：前端实时订阅管理操作台 |
| **08-24** | `remove-quantity-profile-gates` | 12/12：解除量比硬门禁与数量计算简化 |
| **08-24** | `audit-chancore-algorithms` | 8/8：缠论核心算法审计与基准固化 |
| **08-24** | `fix-chan-central-expansion-condition` | 7/7：中枢扩张条件与区间重叠修复 |

---

## 5. 跨环境与实盘运行验收（HIL 待办）

以下属于在代码与单测已完成后，依赖 **Windows 宿主 + 真实行情终端 + 交易时段** 的在线验收与调优：

1. **实时策略实盘观察与切 On 决策**：`REALTIME_PRODUCTIZATION_MODE=shadow` 实盘运行观察，评估切换为 `on`。
2. **实时订阅断流恢复实盘演练**：真实 TDX/QMT 进程重启后断流检测与 A7 告警阈值实盘校准。
3. **盘前巡检与收盘同步生产观察**：部署到 Windows Appliance（`mist-schedule` 容器）后观察 09:05 简报与 22:30/06:30 同步任务。

---

## 6. 明确废弃与已清理项

- `feat/strategy-portfolio-backtesting`（多策略组合回测）：已标记**废弃**，清理过时远端分支。
- `migrate-stack-to-linux-node-with-ssh-tunnel`（Linux 迁移）：提案已**放弃并删除**。
- `feat/realtime-subscription-recovery`：已完全合并至 master，清理过时分支。
