# windows-ops-channel Specification

## Purpose
Define the Windows OpenSSH management channel (key-only, LAN-scoped), host-level operations as local ssh/scp commands, temporary workflow disposition and OpenSSH login auditability.
## Requirements
### Requirement: R1: OpenSSH management channel

Windows API 盒子 SHALL 提供 OpenSSH Server 管理通道（key-only 认证、仅内网
网段放行），macOS 侧可 `ssh` 执行宿主级运维操作（端口检查、终端脚本更新等）。

#### Scenario: 启用后 ssh 直连

- **WHEN** 启用脚本执行完成
- **THEN** macOS `ssh` 到 192.168.31.182:22 MUST 以密钥认证成功
- **AND** 密码登录 MUST 被拒绝
- **AND** 非内网网段（192.168.31.0/24 之外）访问 MUST 被防火墙拒绝

### Requirement: R2: Host-level operations are local commands

端口占用检查与终端桥脚本更新 SHALL 可通过 macOS 本地命令完成（ssh/scp），
不再需要 workflow 触发。

#### Scenario: 端口检查一条命令

- **WHEN** 需要查某端口（如 9004）占用
- **THEN** `ssh mist-box "netstat -ano | findstr :9004"` + `tasklist` 组合
  MUST 给出与 `inspect-windows-port` workflow 等效的信息（监听 PID/进程名）

#### Scenario: 终端脚本更新一条命令

- **WHEN** 需要更新终端桥脚本
- **THEN** `scp` 复制 + `ssh` SHA256 校验 MUST 等效于
  `update-windows-tdx-bridge-script` workflow（含校验失败即中止）

### Requirement: R3: Temporary workflow disposition

临时运维 workflow SHALL 按依赖时机处置：`inspect-windows-port` 与
`update-windows-tdx-bridge-script` SHALL 在本 change 退役；`dump-windows-
datasource-logs` SHALL 降级为兜底（OO 查询为主）；`set-tdx-allowlist-stress`
SHALL 在控制面 DB 写通道（Change 3）落地后退役。

#### Scenario: 退役后无残留入口

- **WHEN** 本 change 落地
- **THEN** `inspect-windows-port.yml` 与 `update-windows-tdx-bridge-script.yml`
  MUST 已从 workflow 目录删除
- **AND** 其功能 MUST 由 runbook 中的本地命令覆盖

### Requirement: R4: Auditability

OpenSSH 登录事件 SHALL 落 Windows Event Log（可查来源 IP/时间/认证方法）；
公钥指纹 SHALL 在启用时记录。

#### Scenario: 登录事件可查

- **WHEN** 需要审计一次 ssh 登录
- **THEN** Event Log（OpenSSH/Operational）MUST 包含该登录的来源 IP 与时间
- **AND** 启用证据 MUST 记录公钥指纹
