# mist-production-baseline

## ADDED Requirements

### Requirement: 生产拓扑 SHALL 支持双节点（Windows 终端机 + Linux 服务节点）

生产部署 SHALL 支持双节点拓扑：Windows 终端机（行情终端 + sshd + 隧道入口）+ Linux 服务节点（全套服务），两节点经内网 + SSH 反向隧道协作。

#### Scenario: 双节点生产运行

- **WHEN** 双节点拓扑部署完成
- **THEN** Windows 终端机提供行情终端与隧道入口
- **AND** Linux 服务节点运行全套服务
- **AND** 终端经隧道访问 Linux datasource

### Requirement: 双节点切换 SHALL 原子发布并提供回滚

Windows 单机 → 双节点切换 SHALL 作为匹配版本组原子发布，提供 preflight、postflight readback 与回滚至单机的能力。

#### Scenario: 切换提供 preflight 与回滚

- **WHEN** 双节点切换执行
- **THEN** 执行 preflight 检查（连通性 / 数据可迁性）
- **AND** 执行 postflight readback（关键表行数 / 链路验证）
- **AND** 提供 repair-forward 或回滚至 Windows 单机栈
