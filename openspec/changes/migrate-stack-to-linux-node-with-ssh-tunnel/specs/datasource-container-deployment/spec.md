# datasource-container-deployment

## ADDED Requirements

### Requirement: datasource SHALL 可在 Linux 服务节点运行

datasource 容器（tdx / qmt）SHALL 支持在 Linux 服务节点运行，不依赖终端 SDK（TDX 无 `tqcenter`、QMT 无 `xtquant`，采集逻辑在终端进程内嵌脚本里）。

#### Scenario: datasource 在 Linux 接收终端数据

- **WHEN** datasource 在 Linux 节点运行
- **AND** terminal bridge 脚本经 SSH 反向隧道连接
- **THEN** datasource 正常接收 HTTP 控制面与 TCP 数据面流量
- **AND** 数据格式与单机部署一致（schema-v2，契约不变）

### Requirement: datasource loopback 信任 SHALL 经 SSH 隧道满足而不放宽校验

datasource 的 `_require_loopback`（`src/core/local_bridge.py`）SHALL 保持不变；跨机访问的 loopback 信任通过 SSH 反向隧道远端 sshd 本地发起连接满足，不引入远端 IP 白名单或放宽校验。

#### Scenario: 跨机来源经隧道呈现为 loopback

- **WHEN** 终端经 SSH 反向隧道访问 datasource 控制面
- **THEN** datasource 观察到 peer 为 127.0.0.1
- **AND** `_require_loopback` 校验通过
- **AND** datasource 代码零改动
