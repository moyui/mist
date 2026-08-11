# Implementation Plan: windows-openssh-ops-channel

> spec 确认后按本计划落地。代码改动全部在 **mist-deploy** 仓库。本计划为普通
> markdown（非 openspec 格式）。

## 文件清单

| 动作 | 文件 | 内容 |
|---|---|---|
| 新增 | `scripts/enable-windows-openssh.ps1` | 幂等启用 OpenSSH Server + 安全配置 |
| 新增 | `.github/workflows/enable-windows-openssh.yml` | 一次性启用 workflow |
| 新增 | `scripts/test-enable-windows-openssh.ps1` | CI 门禁（静态断言） |
| 新增 | `docs/runbooks/windows-openssh-ops.md` | macOS 运维命令速查 |
| 删除 | `.github/workflows/inspect-windows-port.yml` | 退役（本地命令替代） |
| 删除 | `.github/workflows/update-windows-tdx-bridge-script.yml` | 退役（scp 替代） |
| 修改 | `.github/workflows/dump-windows-datasource-logs.yml` | 文件头加降级标注（不删） |

## 1. `scripts/enable-windows-openssh.ps1`（核心）

```powershell
param(
    [string]$SshPort = "22",
    [string]$AllowedCidr = "192.168.31.0/24"
)
$ErrorActionPreference = "Stop"
```

步骤（全部幂等，每步先检测再执行）：

1. **版本检测**（D1，tasks 1.1）：
   ```powershell
   $os = Get-CimInstance Win32_OperatingSystem
   $version = [version]$os.Version
   $isServer = $os.ProductType -ne 1
   $supported = ($isServer -and $version -ge [version]"10.0.17763") -or `
                (-not $isServer -and $version -ge [version]"10.0.17763")
   if (-not $supported) { throw "Windows 10 1809+/Server 2019+ required (found $($os.Caption) $version)" }
   ```
   （17763 = Server 2019 / Win10 1809 的 build 号）
2. **安装检测**：`Get-WindowsCapability -Online -Name "OpenSSH.Server*"` →
   `State -eq "Installed"` 则跳过；否则
   `Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0"`
3. **服务**：`Start-Service sshd`（未运行才启动）+ `Set-Service sshd -StartupType Automatic`
   （幂等：`(Get-Service sshd).StartType` 已 Automatic 跳过）
4. **sshd_config**（D2）：`C:\ProgramData\ssh\sshd_config`——
   读原文件，确保 `PasswordAuthentication no`（已存在则跳过，正则替换现有值），
   写回（备份原文件 `sshd_config.bak`）；`Restart-Service sshd`
   （仅配置实际变化时重启）
5. **防火墙**（D3）：
   ```powershell
   $rule = Get-NetFirewallRule -DisplayName "OpenSSH (sshd)" -ErrorAction SilentlyContinue
   if (-not $rule) {
       New-NetFirewallRule -DisplayName "OpenSSH (sshd)" -Direction Inbound `
           -Protocol TCP -LocalPort $SshPort -RemoteAddress $AllowedCidr -Action Allow
   }
   ```
6. **输出**（D4）：sshd 服务状态、`Test-NetConnection 127.0.0.1 -Port 22`、
   `administrators_authorized_keys` 是否存在、防火墙规则状态、**公钥指纹**
   （若密钥文件存在：`ssh-keygen -lf C:\ProgramData\ssh\administrators_authorized_keys`）

## 2. `.github/workflows/enable-windows-openssh.yml`

```yaml
name: Enable Windows OpenSSH
on:
  workflow_dispatch:
    inputs:
      allowed_cidr:
        description: Firewall remote CIDR (default 192.168.31.0/24)
        required: false
        default: 192.168.31.0/24
        type: string
permissions:
  contents: read
jobs:
  enable:
    runs-on: [self-hosted, windows, mist-api]
    steps:
      - uses: actions/checkout@v4
      - name: Enable OpenSSH Server
        shell: powershell
        run: |
          & "$env:GITHUB_WORKSPACE\scripts\enable-windows-openssh.ps1" `
            -AllowedCidr "${{ inputs.allowed_cidr }}"
```

（仿 inspect-windows-port.yml 结构：workflow_dispatch + self-hosted runner +
checkout + 调脚本）

## 3. `scripts/test-enable-windows-openssh.ps1`（CI 门禁，静态断言）

仿 test-inspect-tdx-login-ui.ps1 模式（macOS pwsh-preview 可跑）：

```powershell
$ErrorActionPreference = "Stop"
$script = Get-Content (Join-Path $PSScriptRoot "enable-windows-openssh.ps1") -Raw -Encoding UTF8
$workflow = Get-Content (Join-Path $PSScriptRoot "..\.github\workflows\enable-windows-openssh.yml") -Raw -Encoding UTF8

foreach ($expected in @(
    "Add-WindowsCapability",
    "OpenSSH.Server",
    "PasswordAuthentication no",
    "Set-Service sshd -StartupType Automatic",
    "New-NetFirewallRule",
    "192.168.31.0/24",
    "ssh-keygen -lf"
)) {
    if (-not $script.Contains($expected)) {
        throw "enable-windows-openssh.ps1 is missing: $expected"
    }
}
if ($script -match "Remove-NetFirewallRule") {
    throw "enable script must not delete firewall rules."
}
if (-not $workflow.Contains("runs-on: [self-hosted, windows, mist-api]")) {
    throw "enable workflow must use the Windows API runner."
}
if (-not $workflow.Contains("enable-windows-openssh.ps1")) {
    throw "enable workflow must invoke the enable script."
}
Write-Host "enable-windows-openssh tests passed"
```

## 4. workflow 退役与降级

- **删除** `inspect-windows-port.yml` / `update-windows-tdx-bridge-script.yml`
  （无对应 test 脚本引用，直接删；git 历史保留）
- **`dump-windows-datasource-logs.yml` 降级标注**：文件头 YAML 注释加：
  ```
  # DEPRECATED (fallback only): datasource logs now queryable in OpenObserve
  # (type=logs, service_name=tdx-datasource/qmt-datasource) per
  # datasource-logs-to-openobserve; kept as fallback when OO is unavailable.
  ```

## 5. `docs/runbooks/windows-openssh-ops.md`（runbook）

内容结构：
1. **前置**：macOS 与 192.168.31.182 同网段可达；密钥已部署
2. **ssh 别名**（~/.ssh/config）：
   ```
   Host mist-box
       HostName 192.168.31.182
       User <windows-user>
       IdentityFile ~/.ssh/mist_ops_ed25519
   ```
3. **常用命令**：
   - 端口检查：`ssh mist-box "netstat -ano | findstr :9004"` + `tasklist | findstr <pid>`
   - 终端桥脚本更新：`scp mist_tdx_realtime_bridge.py mist-box:F:\quant\tdx\PYPlugins\user\` +
     `ssh mist-box "certutil -hashfile ... SHA256"` 比对（SHA 校验失败即中止）+
     重启 TdxW.exe 提示
   - docker logs 兜底：`ssh mist-box "docker logs --tail 300 mist-tdx-datasource"`
   - OO 查询（替代 dump）：指向 mist 仓 docs/otel-observability-queries.md
4. **密钥管理/轮换**：生成新 key → 公钥置入
   `C:\ProgramData\ssh\administrators_authorized_keys`（ACL 仅 SYSTEM +
   Administrators）→ `Restart-Service sshd`
5. **审计查询**：Event Viewer → OpenSSH/Operational（来源 IP/时间/认证方法）

## 6. 验证命令（落地时按序执行，macOS 本地）

```bash
# 静态门禁（pwsh-preview，惯例）
pwsh-preview scripts/test-enable-windows-openssh.ps1
pwsh-preview scripts/test-docker-compose-config.ps1   # 全量门禁抽查
# mist 仓
cd ../mist && openspec validate windows-openssh-ops-channel --strict
```

## 7. 生产启用（需要 Windows 盒子，实盘线程/用户执行）

1. **前置验证（tasks 1.0）**：确认 runner 账户管理员权限；macOS
   `ping 192.168.31.182` + `nc -vz 192.168.31.182 22`（预期失败，22 未开）
2. 合并本 change → 推 origin → 触发 `enable-windows-openssh` workflow
3. macOS 生成专用 keypair（`ssh-keygen -t ed25519 -f ~/.ssh/mist_ops_ed25519`）→
   公钥置入 administrators_authorized_keys（经 workflow 或管理员手动，一次）
4. 实测：`ssh mist-box "echo ok"` 成功、密码登录被拒、
   `nc -vz 192.168.31.182 22` 内网可达
5. evidence 落盘（启用输出 + ssh 实测 + workflow 退役清单）

## 8. 风险与回滚

- **风险**：runner 无管理员权限 → Add-WindowsCapability 失败 → 停下，改用
  管理员手动执行一次（脚本本身幂等，可重复跑）
- **风险**：macOS 与盒子不可达 → D3 前提失败 → 停下讨论 Tailscale（spec 已
  记录备选，不硬推）
- **风险**：防火墙规则误伤 → 规则只 Add 不 Remove（test 断言锁定），误配时
  手动调整
- **回滚**：删除 workflow 有 git 历史可恢复；OpenSSH 卸载=Remove-WindowsCapability
  + 删防火墙规则（runbook 注明，不自动执行）
