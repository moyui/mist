---
name: declarative-realtime-configuration
version: 0.1.0
---

# Declarative Realtime Configuration

## ADDED Requirements

### Requirement: R1: Configuration authority is the database

实时订阅的期望配置（allowlist assignments）与自动收敛开关
（`realtime_subscription_auto_reconcile`）SHALL 以数据库为唯一权威；
`TDX_REALTIME_ALLOWLIST` / `QMT_REALTIME_ALLOWLIST` /
`REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` 环境变量 SHALL 不再作为配置来源。

#### Scenario: allowlist 变更免重启生效

- **WHEN** 通过写通道（ssh + docker exec）更新 DB assignments
- **THEN** backend MUST 在收敛周期内按新期望收敛订阅（无需重启容器）
- **AND** 协调层 MUST 不再读取任何 allowlist 环境变量

### Requirement: R2: Automatic reconciliation converges declared state

协调层 SHALL 定时（@Interval，默认 60s 可配）重读 DB 期望并收敛实际订阅；
`auto_reconcile=true` 时收敛，`false` 时跳过（不主动撤销现有订阅）。

#### Scenario: 改 DB 后自动收敛

- **WHEN** `auto_reconcile=true` 且 DB 期望发生变更（外部写入）
- **THEN** 在下一个收敛周期内 MUST 下发差异 subscribe/unsubscribe
- **AND** 收敛过程 MUST 不需要任何 HTTP 控制端点触发

#### Scenario: 关闭自动收敛

- **WHEN** `auto_reconcile=false`
- **THEN** 协调层 MUST 跳过自动收敛
- **AND** 现有订阅 MUST 保留（不主动撤销，手动接管语义）

### Requirement: R3: Switch semantics are declarative

`realtime_subscription_auto_reconcile` SHALL 支持运行中切换（false→true
挂载收敛 + 立即全量收敛；true→false 停止收敛保留订阅），切换过程免重启；
协调层 SHALL 不再有启动/运行期行为不对称。

#### Scenario: 开关切换免重启

- **WHEN** `auto_reconcile` 由 false 切为 true
- **THEN** 协调层 MUST 挂载收敛并立即对齐 DB 期望（无需重启 backend）
- **AND** 启动时开关为 false 的实例 MUST 在切为 true 后正常工作
      （不存在"启动 off 后协调器失效"状态）

### Requirement: R4: Write path preserves validation and audit

写配置通道 SHALL 保留既有校验（5 只上限、格式、去重、DB 精确匹配）并记录
审计（变更前旧值、操作来源、说明）；不允许绕过校验的应急写入路径。

#### Scenario: 校验与审计

- **WHEN** 写通道更新 allowlist
- **THEN** 校验失败 MUST 中止写入并报错
- **AND** 审计记录 MUST 包含变更前旧值、updated_by（如 ops:ssh）与 comment
