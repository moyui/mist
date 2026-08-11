# Design: windows-openssh-ops-channel

## 决策点

### D1：启用方式——幂等 ps1 + 一次性部署 workflow
- Windows 10/11 OpenSSH Server 是可选功能：`Add-WindowsCapability -Online
  -Name OpenSSH.Server~~~~0.0.1.0`。
- 实施形态：deploy 仓新增 `scripts/enable-windows-openssh.ps1`（幂等：检测已装
  跳过、装后启动 sshd 服务 + 设自动启动 + 防火墙规则 + sshd_config 配置）；
  新增一个一次性 `enable-windows-openssh` workflow（self-hosted runner 执行，
  部署通道仍是唯一引导方式——这是 OpenSSH 通道的"自举"）。
- 前置验证：runner 账户需管理员权限（`Add-WindowsCapability` 与防火墙规则需要
  elevation）；验证任务在 tasks 首节，不通过不继续。
- 启用后通道立即可用（`Test-NetConnection 192.168.31.182 -Port 22`）。

### D2：认证——key-only + administrators_authorized_keys
- **禁用密码登录**（sshd_config `PasswordAuthentication no`）——密钥是唯一
  认证方式。
- **Windows OpenSSH 坑**：管理员组用户默认只读
  `C:\ProgramData\ssh\administrators_authorized_keys`（`authorized_keys` 被忽略
  ——sshd 对 admin 用户安全限制），文件 ACL 需仅 SYSTEM + Administrators。
- 密钥管理：macOS 侧 `ssh-keygen` 生成专用 key（独立于其他用途，可加 passphrase），
  公钥置入 administrators_authorized_keys；私钥仅存 macOS（~/.ssh/）。
- 密钥轮换/吊销流程记录在 runbook（重新生成 + 替换公钥文件 + 重启 sshd）。

### D3：网络边界——防火墙仅内网网段
- 防火墙规则：只放行 `192.168.31.0/24`（或更窄：macOS 的固定 IP）访问 22 端口；
  默认拒绝其他来源。
- **实现前提（先验证再实施）**：macOS 与 192.168.31.182 同网段可达
  （`ping` + 实施后 `ssh` 实测）。若不可达（NAT/跨网段），记录 **Tailscale
  备选方案**（覆盖网络 + OpenSSH 组合），本 change 不实施 Tailscale，交由用户
  拍板后单独推进。
- 公网暴露零容忍：防火墙规则是唯一放行面，D2 的 key-only 是纵深防御。

### D4：审计——Event Log + key 指纹
- OpenSSH 登录成功/失败事件走 Windows Event Log（OpenSSH/Operational，
  登录来源 IP、时间、认证方法可查）。
- 部署脚本记录 sshd 服务状态 + 公钥指纹（fingerprint 落盘 deploy 证据）。
- 不引入额外日志采集（OO 日志通道只覆盖容器内应用日志；宿主安全事件
  留在 Event Log，runbook 注明查询方法）。

### D5：workflow 处置（逐条，含依赖时机）
| workflow | 处置 | 依赖 |
|---|---|---|
| `inspect-windows-port` | **退役**——本地命令替代：`ssh host "netstat -ano \| findstr :9004"` + `tasklist \| findstr <pid>` | 本 change |
| `update-windows-tdx-bridge-script` | **退役**——`scp` 复制桥脚本 + `ssh` 执行 SHA 校验 + 重启 TdxW.exe 提示（runbook 命令） | 本 change |
| `dump-windows-datasource-logs` | **降级为兜底**——Change 1（O2b）落地后 OO 查询为主；workflow 保留（OO 链路故障时仍可用） | Change 1 落地后标注 |
| `set-tdx-allowlist-stress` | **退役**——被 Change 3 的 DB 写通道替代（注意其"5 只上限绕过"能力在 Change 3 校验中补回） | Change 3 落地后执行 |
- 处置原则：**不删 Change 3 未就绪的依赖项**（set-tdx-allowlist-stress 退役
  由 Change 3 的 tasks 负责执行，本 change 只登记）。

### D6：runbook——macOS 运维命令速查
- deploy 仓 `docs/runbooks/` 新增 `windows-openssh-ops.md`：ssh 别名配置
  （~/.ssh/config Host mist-box）、常用命令（端口检查、终端脚本更新 +
  SHA 校验、docker logs 兜底、密钥管理/轮换、Event Log 查询）。
- 所有命令以"macOS 一条命令"为验收标准（对照交接文档验收目标：不再写 workflow）。

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **producer**：Windows 盒子 OpenSSH Server（sshd）——新增服务，监听 22。
- **wire**：内网 TCP 22，防火墙仅 192.168.31.0/24。
- **state**：无业务状态；公钥文件 + sshd_config 是配置态（部署脚本管理）。
- **consumer**：macOS 侧 ssh/scp 客户端（内置）。
- **deploy**：新增 1 个启用 workflow + 1 个 ps1 + 测试脚本（test-enable-windows-
  openssh.ps1 加入 CI 门禁 Assert 风格）；退役 2 个 workflow（本 change）+ 2 个
  （Change 1/3 依赖，登记）。
- **monitoring**：Event Log 审计；ssh 连通性不入 OO（宿主级，runbook 注明）。

## 长期维护成本

- OpenSSH 是 Windows 官方组件，无第三方依赖；key 管理与系统补丁由 Windows
  更新覆盖。
- 22 端口暴露面：仅内网 + key-only，攻击面有限；密钥轮换是唯一例行维护。
- 与 runner 通道的关系：部署仍走 runner（有审批/环境保护），OpenSSH 只覆盖
  运维诊断/宿主操作——两条通道职责分离，不重叠。
- 4 个临时 workflow 退役后，deploy 仓 workflow 数量回归（交接文档"脚本太多"
  痛点缓解）。
