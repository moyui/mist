# Tasks: realtime-subscription-restart-recovery

> 状态约定：双源统一（TDX + QMT 完整实施状态机恢复，用户拍板 2026-08-14）。
> 恢复机制 = 状态驱动轮询重发（PUSHING/VERIFIED/IDLE），datasource 当大脑，
> 桥只执行 poll 下发列表（TDX）或命令执行（QMT），不自带恢复逻辑。
> 改动在 mist-datasource 仓（共享层 / TDX / QMT / 桥 v3.1）与 mist-deploy 仓
> （告警 / HIL）。spec 确认后写实施计划（代码级），再落地。

## 1. 共享层（mist-datasource 仓）

- [x] 1.1 `[datasource]` 实现共享 StallDetector 三态状态机（IDLE/PUSHING/
      VERIFIED + escalated，活动信号注入，fake clock 可测，无 I/O）（D1）。
- [x] 1.2 `[datasource]` 活动窗口：读 `MIST_ACTIVITY_WINDOWS`（默认
      `09:15-11:30,13:00-15:00` UTC+8）判定当前是否窗口内；窗口外强制 IDLE
      （零重连零检出零告警）（D1/D5）。
- [x] 1.3 `[datasource]` 共享 metric：`mist_datasource_subscription_stall_active
      {source}` gauge、`..._stall_total{source,outcome}` counter、
      `mist_datasource_owner_registration_total{source,owner_changed}` counter
      （metrics.py 扩展，低基数 label）（D1/D6）。
- [x] 1.4 `[datasource tests]` StallDetector 单测：三态转换、时段外 IDLE、
      午休/收盘不误报、盘前断流检出、escalated 边界、恢复清除（fake clock）
      （D1/D5）。

## 2. TDX datasource（mist-datasource 仓）

- [x] 2.1 `[datasource]` gateway 接入活动信号：observability 帧 callback_count
      进展喂入（新增 `observe_bridge_activity` 入口，现在只打日志）+ 快照接收
      更新 lastActivity（D1/D2）。
- [x] 2.2 `[datasource]` gateway 维护状态机实例 + asyncio watchdog（tick 默认
      5s）；**poll 语义按状态切换**：PUSHING 返回全量 subscribe、VERIFIED/IDLE
      返回 diff（D2）。
- [x] 2.3 `[datasource]` health 暴露 `pushState/stallDetected/stallEscalated`
      + metric + 日志（D1/D6）。
- [x] 2.4 `[datasource]` `register_owner` 记录 generation 转换日志
      （old→new + 时间戳 + owner_id）+ `owner_registration_total` 递增（D6）。
- [x] 2.5 `[datasource tests]` gateway 状态机单测：PUSHING→poll 全量、
      VERIFIED→poll diff、快照恢复切 VERIFIED、静默切 PUSHING、夜间/时段外
      不误报（fake clock + fake observability 帧）（D2）。
- [x] 2.6 `[datasource tests]` register_owner 重置→poll 全量 subscribe 回归
      测试（现有隐式行为补测试，D2 佐证）。

## 3. QMT datasource（mist-datasource 仓）

- [x] 3.1 `[datasource]` controller 接入活动信号：`_callback_last_seen` +
      lastQuoteAt → StallDetector + asyncio watchdog（tick 默认 5s）（D1/D3）。
- [x] 3.2 `[datasource]` **sync 语义按状态切换（消除 QMT 每 60s 无条件循环
      全量重发）**：VERIFIED 只对比 desired↔registry（一致则零 SDK 调用——
      现行为"每 60s 无条件 cancel + subscribe_whole_quote(全量)"的循环重发
      必须退役）；PUSHING 强制全量重发（cancel + subscribe_whole_quote）且
      立即触发（不等 backend 60s 周期）（D3）。
- [x] 3.3 `[datasource]` health 暴露 `callbackLastSeenAgeSeconds` +
      `pushState/stallDetected/stallEscalated`（D6）。
- [x] 3.4 `[datasource]` `qmt/main.py` 注册 snapshot_age gauge（修复与 TDX
      不对称）（D6）。
- [x] 3.5 `[datasource]` QMT gateway generation 转换日志 + `owner_registration_total`
      递增（owner 变化时）（D6）。
- [x] 3.6 `[datasource tests]` controller 状态机 + 强制全量重发单测：stall 检出
      立即重发、VERIFIED 零 SDK 调用、与 journal/reconciliation 互斥、
      e04a1c8 absent 语义兼容（D3/D5）。
- [x] 3.7 `[datasource tests]` health 字段与 snapshot_age gauge 注册单测。

## 4. TDX 桥脚本 v3.1（mist-datasource 仓 tdx/builtin_bridge）

- [x] 4.1 `[datasource]` 启动上下文日志：pid / 父进程 / 启动时刻 / transport /
      buildId（D6）。
- [x] 4.2 `[datasource]` re-arm 配置门：`REARM_ENABLED`（默认 false）；翻 true
      时 PUSHING 态"全量重发后 callback_count 无增长"路径执行一轮
      unsubscribe+subscribe 强制重挂（D4）。
- [x] 4.3 `[datasource]` `bridgeBuildId`/`bridgeArtifactSha256` 更新（v3.1）。
- [x] 4.4 `[datasource tests]` 桥脚本测试：启动日志断言、re-arm 路径（静态/
      行为，沿用 test_terminal_bridge.py 模式）（D4/D6）。

## 5. QMT 桥脚本（mist-datasource 仓 qmt/builtin_bridge）

  - [ ] 5.1 `[datasource]` 启动上下文日志（pid / 父进程 / 启动时刻 / transport）
      ——与 TDX 桥对齐（可选，若真机观察不需要可略）（D6）。
  - [ ] 5.2 `[datasource tests]` 启动日志断言（沿用 test_qmt_builtin_subscription_bridge.py
      模式）。

## 6. 告警（mist-deploy 仓）

  - [ ] 6.1 `[deploy]` 验证 OO metrics label 查询能力（label 谓词是否尊重时间
      窗口——O3 教训：value 谓词绕过窗口）→ 定 A1 修复形态（D7）。
- [x] 6.2 `[deploy]` A1 盲区修复：按 source 拆分（A1_tdx/A1_qmt）或 label
      过滤（oo-alerts/rules.json + sync-oo-alerts.ps1）（D7）。
- [x] 6.3 `[deploy]` 新规则 A7：`stall_active ≥ 1` → P1（双源一条，按 source
      label）（D7）。
- [x] 6.4 `[deploy]` 活动窗口单点：compose 给 tdx-datasource / qmt-datasource /
      mist-backend（receiver）统一设 `MIST_ACTIVITY_WINDOWS`（默认
      `09:15-11:30,13:00-15:00`），一份定义两处消费，不各自硬编码（D5/D8）。
- [x] 6.5 `[datasource]` 窗口判定一致性：datasource 容器时区确认（UTC+8 判定
      MIST_ACTIVITY_WINDOWS，必要时显式 TZ），与 receiver 同为窗口语义（D5）。
- [x] 6.5 `[deploy tests]` test-workflow-config 断言更新（A1 拆分 + A7）。

## 7. 验证（HIL，真机）

  - [ ] 7.1 `[HIL/用户配合]` TDX 终端重启 HIL：用户重启 TDX 终端（或重载策略）
      → 断言 callback 恢复 + ingest 恢复 + 无 datasource 操作（状态机 PUSHING
      → VERIFIED）；回答 subscribe_hq 幂等性 → 决定 REARM_ENABLED（D2/D4/D8）。
  - [ ] 7.2 `[HIL]` QMT 终端重启验证：终端重启 → 状态机全量重发恢复实证
      （callbackObserved 恢复）；确认 VERIFIED 态零 SDK 调用（D3）。
  - [ ] 7.3 `[HIL]` 双源 stall 告警验证：窗口内模拟断流 → PUSHING → escalated
      → O3 A7 触发 → 投递；窗口外（午休/收盘/夜间）不重连不告警（stall_active=0）
      （D5/D7）。
  - [ ] 7.4 `[HIL]` 阈值校准：STALL_GRACE / MAX_RECOVERY_CYCLES / 活动窗口
      实盘校准（同 B1 grace 校准模式）（D5）。
  - [ ] 7.5 `[HIL]` 重启原因调查：桥启动上下文日志 + generation 转换日志 →
      08-14 无人工自动重启触发源定位（终端自动重启？策略重载？）（D6）。

## 8. 提交（三步工作流）

- [x] 8.1 spec 确认通过后写实施计划（代码级：文件级改动、函数签名、测试
      用例、验证命令）。
- [x] 8.2 实施计划确认后落地（worktree 分支 + 单测 + 验证 + 合并）。
- [x] 8.3 `openspec validate realtime-subscription-restart-recovery --strict`
      + `openspec validate --all --strict`。
  - [ ] 8.4 归档（delta 合并进 live specs 手动同步）。
