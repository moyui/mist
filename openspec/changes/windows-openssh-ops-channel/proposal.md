# Proposal: windows-openssh-ops-channel

## Why

Windows API 盒子（192.168.31.182）**无 SSH，一切运维操作只能靠 GitHub Actions
self-hosted runner 触发 workflow**（30s-2min/轮）。2026-08-11 TDX 行情四层故障
排查当天，为了定位/修复临时新增 4 个 workflow，全部是内联 PowerShell：

| workflow | 用途 | 本质痛点 |
|---|---|---|
| `dump-windows-datasource-logs` | docker logs 容器（观测帧/reject） | 日志不可回溯、不可按 trace_id 检索（Change 1 O2b 落地后由 OO 查询替代） |
| `inspect-windows-port` | netstat 查端口占用（9004=XtItClient） | 每轮触发 + 等 runner；宿主级查询本应一条命令 |
| `update-windows-tdx-bridge-script` | 复制桥脚本到终端 + SHA 校验 | 终端脚本更新必须走 workflow（Copy-Item + 校验 + 提示重启） |
| `set-tdx-allowlist-stress` | 改 .env allowlist + 重启 backend | 无配置 API，应急产物（Change 3 落地后退役） |

用户拍板方向（2026-08-11）："deploy 里面的部署脚本太多了……完全可以用 http
接口或者工具的方案来做。"——经讨论，宿主级操作（端口检查、终端脚本更新、
docker logs 兜底）**不是 API 能解决的**（netstat/tasklist/文件系统都是宿主级），
正确解法是引入 **Windows OpenSSH 管理通道**（用户 08-11 拍板）：macOS
`ssh host "powershell -c ..."` 一条命令完成，告别 workflow 体操。

## What Changes

在 Windows 盒子启用 **OpenSSH Server**（微软官方组件，key 认证、仅内网防火墙），
把宿主级运维操作从 workflow 迁移到 macOS 本地命令：

- **启用**：`Add-WindowsCapability OpenSSH.Server` 幂等 ps1 + 部署 workflow
  （首次启用仍走 runner，一次性）+ 启动 sshd 服务并设为自动。
- **认证**：key-only（禁密码登录）；Windows OpenSSH 对管理员组用户的
  `administrators_authorized_keys` 文件放公钥；密钥由 macOS 侧生成管理。
- **网络边界**：防火墙仅放行内网网段（192.168.31.0/24）；实现前验证 macOS 与
  盒子同网段可达（不可达则记录 Tailscale 备选，本 change 不实施）。
- **审计**：OpenSSH 登录事件走 Windows Event Log（可查登录来源/时间）。
- **workflow 处置**：`inspect-windows-port` / `update-windows-tdx-bridge-script`
  退役（迁移到 ssh 本地命令）；`dump-windows-datasource-logs` 在 Change 1 落地后
  降级为兜底；`set-tdx-allowlist-stress` 在 Change 3 落地后退役。
- **runbook**：macOS 常用运维命令速查（ssh 别名、端口检查、终端脚本更新、
  密钥管理）。

### 边界（不做）

- **不实施 Tailscale**（macOS 与盒子不可达时才讨论；D3 验证后决定，本 change
  默认假设同网段）。
- **不做控制面配置通道**（allowlist/lifecycle 的 DB 化是 Change 3 的职责；本
  change 只提供宿主执行通道）。
- **不建 OO 告警/管理面**（沿用既有决策：诊断走 OTel+OO）。
- **不改 deploy 的部署类脚本**（deploy-docker-appliance.ps1 等保留；本 change
  只处理运维类临时工具与 workflow）。
- **不动 datasource/backend 代码**（纯 deploy 仓 + 文档变更）。

## Capabilities

- **New** `windows-ops-channel`（ADDED：OpenSSH 管理通道、key-only 认证、
  内网边界、workflow 处置、runbook）。

## Assumptions

- self-hosted runner 账户具备启用 OpenSSH 所需管理员权限（实施前验证；
  `Add-WindowsCapability` 与防火墙规则需要 elevation）。
- macOS 与 192.168.31.182 同网段可达（D3 实现前提，先验证再实施防火墙规则）。
- Windows OpenSSH 行为：管理员组用户读 `administrators_authorized_keys`
  （非 `authorized_keys`）——实施按此处理。
- GitHub Actions 的 workflow_dispatch 通道保留（部署流程仍走 runner），
  OpenSSH 是**运维诊断/宿主操作**的补充通道，不替代部署。
