# Evidence: windows-openssh-ops-channel

验证证据占位目录（spec 确认后、实施验证时填充）：

- 启用验证（tasks 1.4/5.1）：enable-windows-openssh.ps1 输出（服务状态、
  公钥指纹、防火墙规则）、macOS ssh 实测（key 成功/密码拒绝/内网放行）。
- workflow 处置清单（tasks 3.x）：退役/降级/登记逐条核对。
- runbook 命令复现（tasks 2.1/2.2）：端口检查与终端脚本更新输出摘录。
