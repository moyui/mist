# realtime-subscription-restart-recovery Specification

## Purpose
Define datasource-side subscription restart recovery: window-gated push-verified state machine, window-scoped stall detection and alarming, re-arm recovery on failed re-delivery, observable restart lifecycle and preserved desired-authority invariants.
## Requirements
### Requirement: R1: Subscription recovery is window-gated and push-verified

TDX 与 QMT 的订阅恢复 SHALL 由 datasource 侧状态机驱动，且**仅 A 股活动窗口内
运转**（窗口 `MIST_ACTIVITY_WINDOWS`，默认 `09:15-11:30,13:00-15:00` UTC+8，
09:15 集合竞价起，不含午休）：窗口内未验证推送时执行轮询重发（PUSHING），
datasource 观察到快照/回调流动（推送成功）即切 VERIFIED 并停止重发；窗口外
强制 IDLE（零重发零检出零告警）。恢复逻辑 SHALL 为共享纯逻辑（双源各实例化），
恢复动作 MUST NOT 常驻于 bridge（桥只执行下发命令）。

#### Scenario: 窗口内初始化轮询直到推送成功

- **WHEN** 活动窗口内初始化或从 VERIFIED 静默进入 PUSHING
- **THEN** 每 PUSHING 重发周期 MUST 全量重发订阅命令
- **AND** datasource 观察到快照/回调流动后 MUST 切 VERIFIED 并停止重发

#### Scenario: 推送成功后稳定态零开销

- **WHEN** 状态为 VERIFIED 且 desired 未变化
- **THEN** TDX poll MUST 返回 diff（桥零动作），QMT sync MUST 零 SDK 调用
- **AND** 正常运行时 MUST NOT 有周期全量重发等常驻动作

#### Scenario: 窗口外零动作

- **WHEN** 处于活动窗口外（收盘后/午休/夜间，如 15:00 后或 11:30-13:00）
- **THEN** 状态 MUST 为 IDLE——不重连、不检出、不告警
- **AND** 下一窗口开始（如 09:15）若数据未流动 MUST 立即切 PUSHING（对盘前
      断流如 08-14 08:44 自然兜底：进窗口即发现并重连/告警）

### Requirement: R2: Stall detection is window-scoped and alarmed (both sources)

stall 检出 SHALL 仅发生在活动窗口内（窗口外即 IDLE，无 DISARM_WINDOW /
ESCALATION_BUDGET 等时段推断机制——窗口本身就是时段边界，写死 A 股，避免
复杂化）：窗口内 VERIFIED 静默超 `STALL_GRACE` 判 stall 切 PUSHING；检出后
SHALL 暴露 `pushState/stallDetected/stallEscalated` health 状态 +
`mist_datasource_subscription_stall_active` gauge + `..._stall_total` counter
+ 日志；窗口外 stall_active 恒 0（规则自然安静）；SHALL NOT 自动重启终端/
datasource/整栈。

#### Scenario: 窗口内断流检出

- **WHEN** 活动窗口内（如 09:15 进窗口后数据本就未流动，或盘中数据停止）
      收敛后快照/回调静默超 `STALL_GRACE`
- **THEN** datasource MUST 切 PUSHING 并导出 gauge/counter
- **AND** 告警链路 MUST 通过 OTel metric 触发（Python 日志不进 OO）

#### Scenario: 窗口外不检出不告警

- **WHEN** 处于活动窗口外（午休/收盘/夜间）
- **THEN** 状态 MUST 为 IDLE，stall_active MUST 为 0，不触发告警
- **AND** 告警规则评估在该时段 MUST 无样本（自然安静），无需 receiver 另做
      时段推断

#### Scenario: 活动恢复清除

- **WHEN** 窗口内 stall 检出后快照/回调活动恢复
- **THEN** stall 状态 MUST 清除（gauge 归零、health 字段复位、切 VERIFIED）

### Requirement: R3: Re-arm recovery re-establishes delivery (both sources)

双源 SHALL 具备窗口内 stall 确认后的强制重挂（re-arm）路径：TDX 桥在
`REARM_ENABLED`（默认 false，HIL 证实 `subscribe_hq` 对已订阅标的 no-op 后
启用）时，于 PUSHING 态"全量重发后 callback_count 无增长"路径执行一轮
unsubscribe+subscribe 强制重挂；QMT PUSHING 态全量重发本即 cancel +
subscribe_whole_quote（re-arm 本质）且由 controller 立即触发（不等 backend
周期）。连续 `MAX_RECOVERY_CYCLES` 轮失败后 MUST 升级为 escalated（告警），
MUST NOT 无限重试。

#### Scenario: 周期重发无法恢复（TDX）

- **WHEN** `REARM_ENABLED=true` 且窗口内 PUSHING 态全量重发后 callback_count
      仍无增长
- **THEN** 桥 MUST 执行一轮 unsubscribe+subscribe 强制重挂
- **AND** re-arm MUST NOT 常驻（仅在 PUSHING 无恢复路径执行，避免投递空隙）

#### Scenario: stall 立即恢复（QMT）

- **WHEN** QMT controller 检出 stall（活动窗口内 PUSHING 态）
- **THEN** controller MUST 立即触发强制全量重发（不等 60s backend 周期）
- **AND** 强制重发 MUST 走既有 journaled 路径（native intent/result 照常记录），
      且 `reconciliation_required` 未完成时 MUST 跳过

#### Scenario: 升级与告警

- **WHEN** 窗口内恢复动作连续失败达到 `MAX_RECOVERY_CYCLES`
- **THEN** datasource MUST 置位 `stallEscalated` 并导出
      `stall_total{outcome=escalated}`
- **AND** MUST NOT 自动重启任何进程（terminal/datasource/stack）

### Requirement: R4: Restart lifecycle is observable (both sources)

datasource SHALL 记录桥 owner 注册/替换的 generation 转换（old→new + 时间戳）
并导出 `mist_datasource_owner_registration_total{source,owner_changed}`；桥脚本
SHALL 在启动时记录上下文（pid/父进程/启动时刻/transport/buildId）以便定位
自动重启触发源；QMT 观测 SHALL 与 TDX 对齐（snapshot_age gauge 注册、health
暴露 callback 活动年龄与 pushState）。

#### Scenario: 桥自动重启可诊断

- **WHEN** 终端/桥在无人工操作时重启（如 08-14 08:51 ownerGeneration 1→3）
- **THEN** datasource 日志 MUST 包含 generation 转换（old→new + 时间戳）
- **AND** 桥启动日志 MUST 包含上下文（pid/父进程/启动时刻），供定位触发源

### Requirement: R5: Desired authority and invariants preserved

本机制 MUST 保持 DB allowlist 为 desired 唯一权威（declarative 不变，
`sync_desired` no-op 语义不变）；MUST NOT 新增 HTTP 写端点/控制端点；MUST NOT
改变正常路径 poll/result 四态收敛语义；MUST NOT 改动 backend ingest
（ingress memory-only 约束）；活动窗口环境变量 `MIST_ACTIVITY_WINDOWS` 单点
定义（compose 传双容器），MUST NOT 各组件自行硬编码时段。

#### Scenario: 允许列表仍是唯一权威

- **WHEN** 通过既有写通道（ssh + docker exec）更新 DB allowlist
- **THEN** 收敛路径 MUST 与 change 前一致（差异 subscribe/unsubscribe）
- **AND** 状态机重发/re-arm MUST 只作用于 desired 集，MUST NOT 引入
      额外配置来源
