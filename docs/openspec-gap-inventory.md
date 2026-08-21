# OpenSpec 缺口清单（2026-08-14 完整盘点）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `specs/`：52 个已采纳 spec
- `changes/`：**12 个 active change**（`archive/` 下 90+ 已归档）
- **价值闭环已打通**（2026-08-13）：`deliver-strategy-notifications` 归档 —— 实时K→信号→PENDING→QQ/微信投递链全通
- **缠论能力进入扩展期**：段/背驰/段级中枢/中枢扩张四个 spec 已规划（依赖链：段→背驰→段级中枢→中枢扩张→买卖点）
- **平台基建成熟**：部署栈迁移到 Linux 的 proposal 已规划；指标库拆分共享已规划；实时订阅重启恢复已规划

---

## 1. 可归档（1 个）

| Change | 进度 | 内容 |
|---|---|---|
| `fix-tdx-historical-amount-unit` | **12/12** | TDX 历史 amount 万元→元修复（migration 019 + Decimal8 ×10000 写入层）；已部署 87f37d2；backtest quantity HIL 前置修复。**待归档动作** |

---

## 2. 收尾债（3 个）

| Change | 进度 | 剩余项 |
|---|---|---|
| `integrate-production-realtime-subscription-lifecycle` | 41/43 | 6.7 源级回滚演练 + 6.8 全量核对归档（需 Windows appliance 手动演练窗口） |
| `extract-backtest-runtime` | 23/26 | 5.5 quantity HIL（TDX/QMT 1m/日线，ineligible 前置）+ 5.6 部署 cutover + 5.2 父任务差勾选 |
| `add-realtime-subscription-operator-ux` | 19/20 | 4.3 真机联测（Deferred，前端独立验证已完成） |

---

## 3. 缠论新规划（4 个，0%，依赖链）

缠论严格依赖链：**笔 → 段 → 段级中枢 → 背驰 → 买卖点**

| Change | 进度 | 位置 | 一句话 |
|---|---|---|---|
| `add-chan-duan-segment` | 0/31 | 链条第一环 | **段（Duan/线段）算法**：特征序列法，单遍递推 + 缺口处理；段是背驰/买卖点的前置 |
| `add-chan-divergence` | 0/25 | 段之后 | **背驰判定**：MACD 红绿柱面积/高度度量力度衰竭（离开段力度 < 进入段力度）；笔级和段级复用同一算法 |
| `add-chan-duan-channel` | 0/27 | 段级中枢 | **段级中枢**：以段为构成单元的中枢，几何定义同笔级（zg/zd/gg/dd + 5 单元滑窗 + mergeSpans） |
| `add-chan-central-extension` | 0/23 | 高级扩展 | **中枢扩张**：残留波动区间重叠的同级中枢合并（更高级别中枢雏形） |

> 注：买卖点 spec 尚未创建，依赖背驰+中枢扩张完成后才规划。

---

## 4. 其他新规划（3 个，0%）

| Change | 进度 | 内容 |
|---|---|---|
| `extract-shared-indicators-library` | 0/29 | **指标库拆分**：两套重复的 MACD/KDJ 实现（indicator.service vs strategy/analysis）共享核心纯计算；策略端经 `StrategyAnalysisObservationCache` 复用 |
| `migrate-stack-to-linux-node-with-ssh-tunnel` | 0/35 | **部署栈迁移到 Linux**：Windows 16GB 内存满载（host + MuMu 模拟器 ~9.5GB），把交易服务栈剥离到 Linux 节点，Windows 退化为纯行情终端机 |
| `realtime-subscription-restart-recovery` | 0/38 | **实时订阅重启恢复**：终端/桥重启后订阅状态失配静默断流（同族问题两处生产实证） |

---

## 5. 被动（1 个）

| Change | 进度 | 内容 |
|---|---|---|
| `capture-realtime-provider-anomalies` | 0/14 | 被动契约：等真实 incident 才执行，不阻塞正常路径；禁止 fault injection |

---

## 6. 已完成未归档 = 0

除了 `fix-tdx-historical-amount-unit`（可归档）外，无"全勾未 archive"的遗漏。

---

## 7. 近期归档（08-13/08-14，含并行会话）

| 日期 | Change |
|---|---|
| 08-14 | remediate-alert-delivery-integrity（40/40，告警规则验证） |
| 08-13 | add-oo-health-alerts（OO 健康告警规则）、**deliver-strategy-notifications**（21/21，价值闭环）、fixed-point-candle-arithmetic（16/16，定点门禁）、restore-mock-env-candle-assertions（22/22，mock 断言 OO）、repair-chan-bi-overlap-rendering（补录） |
| 08-12 | 九连归档（roadmap G2-G4、retire-diagnostic、decouple F4、fix-tdx E-0、otel-gaps 6.3、datasource-logs、declarative、openssh、remediate-otel） |

---

## 8. 平台能力总览（08-14 基线）

- **数据采集**：TDX/QMT/EastMoney 历史 K + DB 落库（3 provider）
- **实时链路（闭环已通）**：schema-v2 → snapshot → candle 聚合（定点化）→ BullMQ → apps/signal → **PENDING → QQ/微信投递**
- **缠论**：合并K / 分型 / 笔 / 笔级中枢 / **段（待实现）** / 背驰（待）/ 段级中枢（待）/ 中枢扩张（待）
- **策略**：定义注册（creation-only）+ KDJ/MACD 指标字段 + signal-level 回测（apps/backtest）
- **前端**：K 线 / 策略工作台 / 实时订阅运营页；dashboard mock（G3 deferred）
- **部署**：12 容器 Compose + OTel/OpenObserve；迁移 Linux 提案已规划
- **运维**：SSH 直连 + 恢复操作清单 + OO 查询手册 + 声明式配置
- **通知**：QQ（NapCat OneBot）+ 企业微信 webhook（apps/notification，at-least-once + dead-letter）
