# Evidence — windows-openssh-ops-channel 生产验证 (2026-08-12)

> OpenSSH 运维通道全链路验证：enable → key 分发 → 用户名探测 → ssh 实测 →
> 退役 workflow 功能由本地命令替代。mist-deploy `830152c` + `76b68c2`/`400505f`
> （distribute/diagnose 辅助 workflow）。

## 验证目标（spec R1–R4）

| Requirement | 验证点 |
|---|---|
| R1 OpenSSH 管理通道（key-only + 仅内网） | sshd running / PasswordAuthentication no / 防火墙 TCP22 仅 192.168.31.0/24 |
| R2 宿主操作本地命令化 | ssh netstat 端口检查 + scp 终端脚本（替代 workflow） |
| R3 临时 workflow 处置 | inspect-windows-port / update-bridge-script 退役（master 已删） |
| R4 审计 | Event Log（OpenSSH/Operational）+ enable/key workflow 输出指纹 |

## 链路实证

### enable-windows-openssh（workflow run `31529973803`，08-12 00:40）
```
sshd 服务: running, StartupType Automatic
sshd_config: PasswordAuthentication no (key-only)
防火墙: TCP 22 仅放行 192.168.31.0/24
公钥指纹: 输出（administrators_authorized_keys 当时缺失 → 下一步分发）
```

### distribute-windows-openssh-key（workflow run `31551799125`，08-12 00:54）
```
Key appended → C:\ProgramData\ssh\administrators_authorized_keys
ACL: BUILTIN\Administrators:(F) + NT AUTHORITY\SYSTEM:(F)   ✅ admin 用户强制要求
sshd restarted
whoami = nt authority\system (runner 服务账户，非登录用户)
```

### diagnose-windows-openssh（workflow run `31552369263`，08-12 01:04）
```
net localgroup Administrators → 成员: 12705, Administrator
Get-LocalUser moyui → "User moyui was not found" (macOS 用户名误用)
sshd_config: Match Group administrators → administrators_authorized_keys (默认 Windows OpenSSH 行为)
```

→ **真实登录用户名 = `12705`**（Administrators 组成员，DESKTOP-T3B1O2J）

### ssh 实测（macOS → 盒子，08-12 01:10）
```
~/.ssh/config:
  Host mist-box
    HostName 192.168.31.182
    User 12705
    IdentityFile ~/.ssh/mist_ops_ed25519
    IdentitiesOnly yes

ssh mist-box "whoami && hostname"
  → desktop-t3b1o2j\12705
  → DESKTOP-T3B1O2J
  → SSH_ALIAS_OK   ✅
```

nc -vz 192.168.31.182 22 → succeeded（22 端口内网可达）。

### R2 宿主操作本地命令化

**端口检查（替代 inspect-windows-port workflow）**：
```
ssh mist-box 'netstat -ano | findstr ":9001 :9002 :9003 :8001" | findstr LISTENING'
  TCP    0.0.0.0:8001           LISTENING       14632   (mist-backend)
  TCP    127.0.0.1:9001         LISTENING       14632   (tdx-datasource HTTP)
  TCP    127.0.0.1:9002         LISTENING       14632   (qmt-datasource HTTP)
  TCP    127.0.0.1:9003         LISTENING       14632   (tdx bridge TCP)
```
✅ 一条 ssh 命令等效于原 inspect-windows-port workflow（无 runner 等待）。

**终端脚本更新流程（替代 update-windows-tdx-bridge-script workflow）**：
```
scp 多次成功（hil-declarative.cjs / oo-query.cjs → mist-box:C:/Users/12705/）
ssh mist-box 'dir C:\Users\12705\*.cjs'
  hil-declarative.cjs  1833 bytes
  oo-query.cjs          910 bytes   ✅ scp 通道工作
```
（桥脚本正式更新流程见 runbook §3：scp + certutil -hashfile SHA256 比对 + 重启 TdxW.exe）

### R3 退役 workflow 核对

- `.github/workflows/inspect-windows-port.yml` → 已删（mist-deploy `830152c`）
- `.github/workflows/update-windows-tdx-bridge-script.yml` → 已删（同上）
- `dump-windows-datasource-logs.yml` → 降级标注（OO 查询为主，保留兜底）
- `set-tdx-allowlist-stress.yml` → 已退役（master 已删）

✅ active workflow 目录核对：4 个临时 workflow 均已处置。

## 后续运维通道（runbook 已落盘）

`docs/runbooks/windows-openssh-ops.md` 含：ssh 别名配置、端口检查、终端脚本更新（scp+SHA+重启）、docker logs 兜底、OO 查询、密钥轮换、Event Log 审计。

## 辅助 workflow 去留

- `distribute-windows-openssh-key.yml`：**保留**（未来 key 轮换用，幂等）
- `diagnose-windows-openssh.yml`：**保留**（排障工具，net localgroup / sshd_config / 用户家目录 key 一键诊断）
