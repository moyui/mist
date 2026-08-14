# monitoring-health-alerts

## ADDED Requirements

### Requirement: SSH 反向隧道存活 SHALL 被监控

autossh 维护的 SSH 反向隧道存活状态 SHALL 被监控，断线时触发告警。

#### Scenario: 隧道断线告警

- **WHEN** SSH 反向隧道连接断开
- **THEN** 监控检测到隧道失活
- **AND** 触发告警通知

### Requirement: Linux 服务节点健康 SHALL 被监控

Linux 服务节点的存活与各服务健康 SHALL 纳入监控。

#### Scenario: Linux 节点健康观测

- **WHEN** Linux 服务节点运行
- **THEN** 节点存活与各服务健康状态可观测
- **AND** 异常时触发告警
