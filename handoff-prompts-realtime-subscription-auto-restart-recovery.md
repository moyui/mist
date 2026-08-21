# Handoff Prompt：实时订阅"早上自动重启后丢失"机制（QMT + TDX 同族问题）

日期：2026-08-14（周五）开盘前
用途：单独开一个线程，专门解决"终端/桥早上自动重启后订阅静默丢失"的机制问题。

---

## 一、背景（两个生产实证，同族问题）

### 实证 1：QMT 死锁（2026-08-13 开盘，已修复已部署）
- 现象：终端重启 → XtQuant SDK 订阅全丢 → datasource journal 持久化 registry 仍持有旧
  sub_id → `_sync` 每次先 unsubscribe 旧 sub_id（SDK 返回 false）→ 失败 raise → **subscribe
  永不执行** → 永久死锁（journal 每分钟 unsubscribe 665 false ×53）
- 修复：`e04a1c8`（datasource，已部署 141efe2）：
  1. `_cancel_handle`：unsubscribe 返回 `success=false`（bool）视为 SDK 侧订阅已不存在
     （absent）→ `confirmedBy=hil_boolean_false_absent` → 清 registry 继续 subscribe
  2. `_restore_startup_state`（重放路径）：journal 重放时 success=false 的 unsubscribe
     → resolve candidate（datasource 自身重启也不会恢复失效 sub_id）
  3. `_attempt_startup_cleanup`：success=false 也算清除确认
  - 部署后自愈实证：reconciliationRequired=false + wholeHandleCount=1 + 无 UNCONFIRMED 残留
- 恢复手段（修复前）：`Clear Windows QMT Context Observation` workflow（action=reset-journal）

### 实证 2：TDX 订阅静默丢失（2026-08-14 开盘前，**未修复**）
- 现象：08:51 桥自动重启（ownerGeneration 1→3，**重启原因待查**——终端自动重启/策略重载？
  当时无人工操作）→ 终端订阅回调丢失 → **datasource 内存 registry 仍认为已订阅**
  （desired/converged=2 + sync_subscriptions 763 success）→ **不下发新 subscribe_hq** →
  `callback_count=0` 持续 + backend 无 ingest（断流 08:44:59 → 09:25）
- 诊断要点：
  - 桥 observability counters（`callback_count`/`fetch_count`）归零 = 订阅失效信号
  - `tcp registered` / `POST /tdx/bridge/owner` 密集出现 = 桥重启/重连事件
  - backend `candle ingest` 断流时间定位断点
- 恢复手段（临时）：`docker restart mist-tdx-datasource`（内存 registry 清空 → 重新
  reconcile → 下发 subscribe_hq → 回调恢复，09:25 实证）

### 同族本质
**订阅状态失配**：桥/终端重启后订阅实际丢失，但 datasource 侧状态（QMT journal 持久化 /
TDX 内存）认为已订阅 → 不重新下发 subscribe → 数据静默断流。QMT 有 journal 所以更顽固
（重启 datasource 也恢复旧状态）；TDX 是内存所以重启 datasource 即恢复——但两者都缺
**"桥重启后自动重新订阅"**的机制。

---

## 二、问题定义（新线程要解决的）

1. **TDX 侧缺口（主要）**：桥重启后 datasource 不感知、不重新下发订阅。需设计
   "桥重启感知 → 强制重新订阅"机制。
   - 关键线索：datasource **已经有 ownerGeneration 字段**（health 可见）——桥每次重启
     generation 递增。datasource 应检测 generation 变化 → 触发全量重新订阅（或至少
     重新下发 subscribe_hq 到桥）。
   - 参考 QMT 修复的三处模式（cancel absent 确认 + 重放路径 + startup cleanup）。
2. **"早上自动重启"的根因调查**：TDX 桥 08:51 为什么重启？（终端自动重启？TDX 终端
   启动时自动加载策略？Windows 计划任务？）QMT 08-13 是用户手动重启——今天早上 QMT
   是否也自动重启过？需要调查重启触发源（可能两边都是"终端早上自动重启"）。
3. **QMT 侧确认**：e04a1c8 是否完全覆盖"早上自动重启"场景（含 datasource 自身重启 +
   journal 重放）——08-14 早上 QMT 正常（callbackObserved=1）是首验，但自动重启场景
   建议再验证一次（或确认测试覆盖）。
4. **统一机制 vs 分源**：TDX（内存 registry）与 QMT（journal registry）恢复机制不同——
   是否要做统一的"桥 generation 变化 → 强制重新订阅"？还是各自独立修复？

---

## 三、现状基线（新线程开工前确认）

- 生产：mist-backend `eb51a300`（含 fixed-point + readback + remediate 全部）+ datasource
  `141efe2`（含 QMT 死锁修复 e04a1c8 + TDX 桥 F4 a3506b1）
- TDX 桥终端脚本：`F:\quant\tdx\PYPlugins\user\mist_tdx_realtime_bridge.py`（v3.0，
  artifactSha256=ec40b428...，昨晚 scp 更新 + 用户重启终端加载）
- QMT 桥终端脚本：`mist-qmt-realtime-bridge-v3.0`（手动 copy，**不要 scp**——GBK 编码敏感）
- TDX datasource 订阅管理：declarative（DB allowlist 驱动，auto_reconcile）+ 桥轮询
  `POST /tdx/bridge/subscriptions/poll` 拿命令（subscribe_hq）
- QMT datasource 订阅管理：journal + `_sync`（subscription.py）
- 相关日志位置（docker logs）：
  - `mist-tdx-datasource`：`tcp registered`、`bridge observability`（counters）
  - `mist-qmt-datasource`：`/qmt/bridge/subscriptions/poll`
  - `mist-backend`：`candle ingest start source=tdx|qmt`

---

## 四、设计方向（开放讨论，勿直接实施）

1. **TDX 桥重启感知**：datasource 检测桥 ownerGeneration 变化（或 TCP 重连事件）→
   触发"全量重新订阅"（把 desired 全部重新下发 subscribe_hq，幂等）。
2. **TDX 订阅下发机制**：确认桥轮询 subscriptions/poll 拿到 subscribe 命令后是否
   总是执行 subscribe_hq（还是做了"已订阅跳过"去重？——若跳过则 generation 变化后
   需要强制位）。
3. **QMT 对照**：e04a1c8 已覆盖 unsubscribe-absent；"终端重启后 datasource 主动重发
   subscribe"是否需要类似 generation 感知（QMT bridge ownerGeneration 也有）。
4. **测试**：确定性测试（模拟桥重启 → 断言重新订阅）+ 真机 HIL（可选）。
5. **范围**：这属于 provider 语义变更——**按 Mist 三步走**（spec → 实施计划 → 落地，
   每步停下等用户确认）。

---

## 五、相关文件/记忆

- QMT 死锁修复：`mist-datasource/src/datasource/qmt/realtime/subscription.py`（e04a1c8）
- TDX datasource 订阅管理：`mist-datasource/src/datasource/tdx/realtime/`（gateway/
  subscription controller）
- TDX 桥脚本：`mist-datasource/tdx/builtin_bridge/mist_tdx_realtime_bridge.py`
- 记忆：[[qmt-sync-unsubscribe-deadlock]] [[tdx-bridge-restart-subscription-loss]]
  [[tdx-bridge-tcp-restore-20260811]] [[realtime-sync-subscriptions-no-producer]]
- 恢复 workflow：`clear-windows-qmt-context-observation.yml`（QMT reset-journal）

## 六、验收标准（建议）

- TDX：桥重启（或 datasource 重启）后，**无需人工干预**，订阅自动恢复（callback>0 +
  ingest 恢复），有日志/指标可观测
- QMT：终端/桥重启后自动恢复（e04a1c8 已覆盖 unsubscribe-absent 路径；如需要
  generation 感知则一并做）
- 确定性测试覆盖"桥重启 → 重新订阅"路径
- 不破坏现有 declarative 配置（DB allowlist 仍是 desired 权威）
