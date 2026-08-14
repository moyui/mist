# windows-docker-appliance

## ADDED Requirements

### Requirement: Windows 主机 SHALL 可退化为行情终端机

当 Linux 服务节点就绪并验证通过后，Windows 主机 SHALL 可退化为纯行情终端机，仅保留 TDX / QMT 终端进程 + sshd + SSH 隧道入口，移除 Docker Desktop / WSL2 / 全部容器。

#### Scenario: Windows 去除 Docker

- **WHEN** Linux 节点切换验证通过且稳定运行
- **THEN** Windows Docker 栈下线
- **AND** Docker Desktop / WSL2 停用或卸载
- **AND** Windows 仅保留终端进程与 sshd

### Requirement: 切换前 Windows Docker 栈 SHALL 保留为回滚目标

切换至 Linux 节点之前，Windows Docker 栈（镜像 / 配置 / 数据）SHALL 完整保留，作为可回滚目标，不提前删除。

#### Scenario: 切换期间保留回滚能力

- **WHEN** Linux 节点验证期间或验证未通过
- **THEN** Windows Docker 栈保持可用
- **AND** 可随时回滚至 Windows 本地 datasource
