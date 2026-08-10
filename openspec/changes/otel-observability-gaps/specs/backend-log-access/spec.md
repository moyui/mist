---
name: backend-log-access
version: 0.1.0
---

# Backend Log Access

## ADDED Requirements

### Requirement: R1: 标准日志读取工具
SHALL 提供参数化的 backend 日志读取 workflow（service / 行数 / 时间窗口 / grep 关键字），
替代临时把 `docker logs` grep 塞进专项 workflow 的做法。

#### Scenario: 按需读取任意 backend 日志
- Given 需要排查某 service 的日志（如 mist-backend）
- When 调用日志读取工具并指定 service、时间窗口、关键字
- Then 输出 SHALL 包含对应窗口的日志片段，且不要求修改专项 workflow

### Requirement: R2: 时间约定
日志/验证脚本的时间窗口计算 SHALL 统一使用 UTC（epoch 微秒），展示标注时区，
避免时区换算错误。

#### Scenario: 窗口计算不因时区出错
- Given 脚本按本地时区计算 OO 查询窗口
- When 窗口跨日/跨时区
- Then 计算 SHALL 以 UTC 为基准，输出标注时区

### Requirement: R3: 指标历史查询方式
OO metrics 查询窗口/聚合行为 SHALL 被文档化（正确查询方式），O3 日志平台落地前
不引入额外指标快照存储。

#### Scenario: 历史指标可查
- Given 需要查询上午时段的 skip/discard 计数
- When 按文档化的查询方式（正确窗口/聚合语义）
- Then 可取得对应时段数值，或明确该时段不可得的限制
