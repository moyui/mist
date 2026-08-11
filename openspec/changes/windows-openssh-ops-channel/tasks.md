# Tasks: windows-openssh-ops-channel

> 状态约定：本 change 改动集中在 mist-deploy 仓库（ps1 脚本 + workflow + runbook）；
> OpenSpec 文件在 mist 仓库。spec 确认后写实施计划（代码级），再落地。

## 1. 启用与安全（mist-deploy）

- [ ] 1.0 前置验证：确认 self-hosted runner 账户具备管理员权限
      （`Add-WindowsCapability`/防火墙需要 elevation）；确认 macOS 与
      192.168.31.182 同网段可达（D3 前提，不可达则停下讨论 Tailscale）。
- [ ] 1.1 新增 `scripts/enable-windows-openssh.ps1`（幂等）：**检测系统版本
      （Win10 1809+ / Win11 / Server 2019+，不满足报错退出）**+ 检测/安装
      OpenSSH.Server 可选功能 → 启动 sshd 服务 + 设自动启动 → sshd_config
      （`PasswordAuthentication no`）→ 防火墙规则（仅 192.168.31.0/24 放行
      22）→ 输出公钥指纹与 sshd 状态（D1/D2/D3）。
- [ ] 1.2 新增一次性 workflow `enable-windows-openssh.yml`（workflow_dispatch，
      self-hosted runner，调用 1.1 脚本）；`test-enable-windows-openssh.ps1`
      加入 CI 门禁（Assert 风格断言脚本内容/幂等性）。
- [ ] 1.3 密钥分发：macOS 侧生成专用 keypair（独立用途，可加 passphrase），
      公钥置入 `C:\ProgramData\ssh\administrators_authorized_keys`（ACL 仅
      SYSTEM + Administrators）（D2）。
- [ ] 1.4 验证：macOS `ssh` 连通（key 认证成功、密码登录被拒）、
      `Test-NetConnection 22` 仅内网放行。

## 2. 本地工具迁移

- [ ] 2.1 端口检查本地命令验证：`ssh mist-box "netstat -ano | findstr :9004"`
      + `tasklist | findstr <pid>` 复现 inspect-windows-port 输出（D5）。
- [ ] 2.2 终端脚本更新流程验证：`scp` 桥脚本到终端路径 + `ssh` SHA256 校验 +
      重启 TdxW.exe 提示，复现 update-windows-tdx-bridge-script（D5）。

## 3. workflow 处置

- [ ] 3.1 退役 `inspect-windows-port.yml`（本 change 落地即删）。
- [ ] 3.2 退役 `update-windows-tdx-bridge-script.yml`（本 change 落地即删）。
- [ ] 3.3 `dump-windows-datasource-logs.yml` 降级标注（OO 查询为主，保留兜底；
      Change 1 落地后加注）。
- [ ] 3.4 `set-tdx-allowlist-stress.yml` 退役登记（**执行由 Change 3 负责**，
      本 change 不删）。

## 4. 文档

- [ ] 4.1 `docs/runbooks/windows-openssh-ops.md`：ssh 别名（~/.ssh/config
      Host mist-box）、常用命令速查（端口/终端脚本/docker logs 兜底）、密钥
      管理与轮换、Event Log 审计查询（D4/D6）。
- [ ] 4.2 交接文档（otel-whitebox-20260810/）登记通道上线状态与用法。

## 5. 验证

- [ ] 5.1 macOS → 盒子端到端：key 认证、密码登录拒绝、防火墙内网放行/外网
      拒绝、端口检查与终端脚本更新两条路径复现（2.1/2.2 场景）。
- [ ] 5.2 deploy 仓 CI 门禁：`test-enable-windows-openssh.ps1` + 既有
      `test-*.ps1` 全绿；`openspec validate windows-openssh-ops-channel --strict`。
- [ ] 5.3 证据落盘 `evidence/`（启用输出、ssh 实测、workflow 退役清单）。

## 6. 提交（三步工作流）

- [ ] 6.1 spec 确认通过后写实施计划（代码级）。
- [ ] 6.2 实施计划确认后落地（分支 + 验证 + 合并）。
- [ ] 6.3 归档（delta 合并进 live specs 手动同步）。
