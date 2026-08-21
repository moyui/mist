# Proposal: realtime-subscription-restart-recovery

## Why

实时订阅在"终端/桥重启"场景下存在**订阅状态失配**导致的静默断流，两个生产实证
（同族问题）：

1. **QMT 死锁（2026-08-13 开盘，已修复已部署 e04a1c8）**：QMT 终端人工重启 →
   XtQuant SDK 订阅全丢 → journal 持久化 registry 仍持有旧 sub_id → `_sync` 先
   unsubscribe 旧 sub_id（SDK 返回 false）→ 失败 raise → **subscribe 永不执行**
   → 永久死锁（journal 每分钟 unsubscribe 665 false ×53）。修复：`success=false`
   视为"SDK 侧订阅已不存在（absent）"→ 清 registry 继续 subscribe（三处：
   `_cancel_handle` / `_restore_startup_state` 重放路径 / `_attempt_startup_cleanup`）。
2. **TDX 订阅静默丢失（2026-08-14 开盘前，未修复）**：**当时无人工操作**，桥自动
   重启（ownerGeneration 1→3，重启原因待查——终端自动重启/策略重载？）→ 终端
   订阅回调丢失 → datasource 内存 registry 仍认为已订阅（desired/converged=2 +
   sync_subscriptions 763 success）→ **不下发新 subscribe_hq** → `callback_count=0`
   持续 + backend 无 ingest（断流 08:44:59 → 09:25，40 分钟无告警；断流早于桥
   重启约 6 分钟，重启是症状还是原因未明）。恢复手段（临时）：
   `docker restart mist-tdx-datasource`。

同族本质：**桥/终端重启后（或终端侧独立死亡后）订阅实际丢失，但 datasource 侧
状态（QMT journal 持久化 / TDX 内存）认为已订阅 → 不重新下发 subscribe → 数据
静默断流**。断流不总是"重启触发"，TDX 实证中终端可能先独立死亡。

**TDX 架构根因（代码实证）**：TDX 订阅是"增量 diff + 四态收敛"设计——poll 只返回
`desired − _last_reported_active`（gateway.py:352-354），收敛后 subscribe_hq
**不会再发出**；`sync_desired` 对未变化列表直接 no-op（gateway.py:287-288）；
`_last_reported_active` 来自桥对 `get_subscribe_hq_stock_list()`（SDK 订阅表）的
信任——**表在 ≠ delivery 活着**（08-14 就是表还在、回调全死）。

**官方文档实证（2026-08-14，help.tdx.com.cn ctx.stock）**：
`subscribe_hq(stock_list: List[str] = [], callback = None)` **原生支持批量订阅**
（列表参数，≤100 只），回调收到 JSON 字符串 `{"Code":"XXXXXX.XX","ErrorId":"0"}`。

**用户拍板（2026-08-14 讨论定案）**：
- **双源统一作为事实标准**：检测+告警、可观测、re-arm 在 TDX 和 QMT **都完整实施**
  （QMT 从"仅验证"升级为"完整改造"）。
- **恢复机制 = 状态驱动的轮询重发，不常驻**：桥/订阅在初始化或断流时执行轮询重发，
  **一旦推送成功（datasource 观察到快照/回调流动）即停止重发**——正常运行时零额外
  SDK 调用；断流检出后再恢复重发循环。
- 恢复逻辑**不放 bridge**（终端内脚本高频 SDK 调用太重）——全部由 datasource
  通过 poll/sync 语义切换驱动；TDX 桥几乎零改动（只是照常执行 poll 下发列表），
  QMT 桥完全不动。

## What Changes

**① 共享层（mist-datasource 仓，双源复用）**
- 共享 **IDLE / PUSHING / VERIFIED 状态机**（纯逻辑，fake clock 可测）：
  **仅 A 股活动窗口内（`MIST_ACTIVITY_WINDOWS`，默认 `09:15-11:30,13:00-15:00`
  UTC+8，09:15 集合竞价起、去午休，用户拍板）运转**——窗口内 PUSHING 重发直到
  datasource 观察到快照流动切 VERIFIED（停，零开销）、静默超 grace 回 PUSHING；
  窗口外强制 IDLE（零重发零检出零告警——收盘/午休/夜间无动作，写死窗口避免
  "datasource 零时段 + 凌晨退避重连"的复杂化）。爬升：PUSHING 持续
  `MAX_RECOVERY_CYCLES` 轮无恢复 → escalated（告警，不自动重启）。
- **活动信号源**两源各接各的（TDX=快照接收 + observability 帧 callback_count
  进展；QMT=`_callback_last_seen` + lastQuoteAt）。
- 共享 OTel metric（metrics.py，已有 instruments）：
  `mist_datasource_subscription_stall_active{source}` gauge、
  `..._stall_total{source,outcome}` counter、
  `mist_datasource_owner_registration_total{source,owner_changed}` counter。
- 阈值 env 可配（见 design D5 参数表），HIL 校准。

**② TDX（datasource + 桥脚本 v3.1）**
- **状态机由 datasource 掌控**：gateway 维护 PUSHING/VERIFIED，据此切换 poll 语义
  ——PUSHING 态 poll 返回全量 subscribe（桥照常执行，即全量重发）；VERIFIED 态
  poll 返回 diff（现有语义，桥零动作）。桥**无状态、无感知**，只是照常执行 poll
  下发的列表。
- **检测+告警**：stall 检出（activity-based 武装）→ 进 PUSHING → health 字段
  `bridge.stallDetected/stallEscalated` + gauge/counter + 日志（datasource Python
  日志不进 OO，**告警走 metrics**）。
- **re-arm（条件启用，配置门）**：HIL 证实 `subscribe_hq` 对已订阅标的是 no-op
  时，桥在 PUSHING 态"全量重发后 callback_count 无增长"路径执行一轮
  unsubscribe+subscribe 强制重挂；`REARM_ENABLED` 配置门默认 false，HIL 校准后
  翻 true。
- **可观测**：generation 转换日志（old→new + 时间戳）+ 桥启动上下文日志
  （重启原因调查——08-14 为什么自动重启）。

**③ QMT（datasource，完整改造对齐 TDX）**
- **状态机同样由 controller 掌控**：VERIFIED 态 `sync_subscriptions` 只对比
  desired ↔ registry（一致则零 SDK 调用——消除既有每 60s 无条件全量重发的
  性能开销）；PUSHING 态（初始化/断流检出）强制全量重发
  （cancel + subscribe_whole_quote）。
- **re-arm**：PUSHING 态全量重发本即 cancel + subscribe_whole_quote（即 re-arm
  本质）；断流检出后 controller 内立即触发，不等 backend 60s 周期；重试循环 →
  escalated。
- **可观测**：health 暴露 callback 活动年龄 + `stall_active{source=qmt}` +
  日志；`qmt/main.py` 注册 snapshot_age gauge（修复与 TDX 不对称）；generation
  转换日志；桥启动上下文日志。
- **QMT 桥完全不动**（命令下发机制不变，改的是 controller 的 sync 语义）。

**④ 告警（mist-deploy 仓）**
- **A1 盲区修复**：A1 规则 `count(*)` 不区分 source（TDX 正常时 QMT 单独断流
  不触发）→ 按 source 拆分规则或 label 过滤（先验证 OO label 查询能力）。
- **新规则**：`stall_active ≥ 1` → P1（双源一条，按 source label）。

**⑤ 验证**
- TDX 终端重启 HIL（决定 re-arm 启用 + 回答 subscribe_hq 幂等性 + 重启原因调查）。
- QMT 终端重启验证（状态机全量重发恢复实证）。
- 双源 stall 告警验证（模拟断流 → O3 规则触发 → 投递）。

### 边界（不做）

- **不自动重启**终端/datasource/整栈（遵循 integrate-production-
  realtime-subscription-lifecycle 约束——reconciliation failure 不自动重启；
  恢复全部 in-process）。
- **不新增 HTTP 写端点/控制端点**。
- **不恢复已退役的诊断 HTTP 端点**（诊断走 OTel+OO）。
- **不改 backend**（apps/mist）：ingress memory-only 约束不动；检测/恢复/状态机
  全部 datasource 控制面。
- **不改 DB/allowlist 权威**（declarative 不变，DB 仍是 desired 唯一权威；
  `sync_desired` no-op 语义不变）。
- **QMT journal 语义不变**：状态机驱动的全量重发走既有 `_sync` 路径
  （native intent/result 照常 journaled），与 e04a1c8 absent 语义兼容。
- **不做 A 股节假日休市日历引擎**：本 change 仅日内活动窗口
  （`MIST_ACTIVITY_WINDOWS`，默认 `09:15-11:30,13:00-15:00` UTC+8，09:15 集合
  竞价起）；工作日/节假日判断是另一维度（K 线边界/收盘部署另处处理），后续单独
  change。
- **桥只做"执行 poll 下发列表"**（TDX）与"命令执行"（QMT）——不自带任何恢复
  逻辑/计时器（恢复逻辑不落 bridge，用户拍板"太重了"）。
- **不引入新依赖**。

## Capabilities

- **New** `realtime-subscription-restart-recovery`（本 change 主体：TDX/QMT
  双源 PUSHING/VERIFIED 状态机 + stall 检测告警 + re-arm + 可观测，全部
  datasource 控制面 + TDX 桥 v3.1 + deploy 告警规则）。
- **Modified** `realtime-market-data-ingress`（收敛语义 delta：订阅收敛不等于
  数据流动证据，需推送验证/状态机补充）。
- **Modified** `monitoring-health-alerts`（A1 source 盲区修复 + stall 新规则）。

## Assumptions

- TDX 桥脚本 v3.1 与 datasource 一起部署，`bridgeArtifactSha256` 断言同步更新
  （既有 Assert-BridgeIdentity 机制）。
- `subscribe_hq` 对已订阅标的重复调用**是否幂等重挂回调**未知——由 HIL 决定
  re-arm 启用（D4）。
- 状态机"推送成功"信号 = datasource 观察到快照流动（+ 回调进展辅助）；活动
  窗口写死 A 股（`MIST_ACTIVITY_WINDOWS` env 单点，compose 传双容器），不做
  datasource 零时段 + 告警侧推断的复杂分离。
- 阈值默认值（活动窗口 / STALL_GRACE / MAX_RECOVERY_CYCLES / PUSHING 重发
  频率 / TICK）为初值，HIL 校准（同 B1 grace 校准模式）。
