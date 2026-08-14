# linux-service-node-deployment

## ADDED Requirements

### Requirement: Linux 服务节点 SHALL 运行全套 Mist 服务

全套 Mist 服务（datasource tdx/qmt、backend、mysql、realtime-redis、signal、chan-api、napcat、astrbot、openobserve、fe、web-gateway）SHALL 可在单个 Linux 服务节点运行，与单机 Windows Docker 栈功能等价。

#### Scenario: Linux 节点全套服务启动

- **WHEN** Linux 服务节点启动全套 Compose 栈
- **THEN** 所有服务健康检查通过
- **AND** backend 能连接本机 datasource / mysql / realtime-redis（localhost）

### Requirement: 终端 ↔ Linux datasource 通信 SHALL 经 SSH 反向隧道桥接

terminal bridge 脚本（开源，连接 localhost）与 Linux datasource 之间 SHALL 通过 SSH 反向隧道（autossh）桥接，两端开源代码零改动。

#### Scenario: 终端经隧道注册 datasource owner

- **WHEN** terminal bridge 脚本连接 Windows localhost
- **THEN** 流量经 SSH 反向隧道到达 Linux datasource
- **AND** datasource 观察到来源 peer 为 127.0.0.1（sshd 本地发起）
- **AND** loopback 校验通过，owner 注册成功

### Requirement: autossh SHALL 由 systemd 管理并自动重连

SSH 反向隧道 SHALL 由 Linux systemd 管理的 autossh 维护，配置 `ServerAliveInterval` + `ExitOnForwardFailure` + `Restart=always`，断线自动重连。

#### Scenario: 隧道断线自动恢复

- **WHEN** SSH 隧道连接断开
- **THEN** autossh 检测断线并在心跳超时后重连
- **AND** systemd 在 autossh 退出时自动重启
- **AND** 隧道恢复后终端重新注册 owner

### Requirement: Linux 节点 SHALL 可回滚至 Windows Docker 栈

切换至 Linux 节点 SHALL 保留 Windows Docker 栈（镜像 / 配置）作为回滚目标，Linux 节点故障时可退回。

#### Scenario: 回滚至 Windows Docker 栈

- **WHEN** Linux 节点故障或验证不通过
- **THEN** 断开 SSH 隧道，终端恢复连接 Windows 本地 datasource
- **AND** 重启 Windows Docker 栈恢复服务
