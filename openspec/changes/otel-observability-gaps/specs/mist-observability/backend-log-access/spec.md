---
name: backend-log-access
version: 0.1.0
---

# Backend Log Access

## ADDED Requirements

### Requirement: R1: 日志进 OO
backend pino 日志 SHALL 经 OTLP 进入 OpenObserve（logs 流），与 spans 同 trace_id 关联，
可按时间任意回溯检索；不依赖 docker logs tail 容量。

#### Scenario: 按 trace_id 检索日志
- Given 一个 candle 处理 trace 已生成
- When 在 OO 按 trace_id 检索日志
- Then 该 trace 的 pino 日志 SHALL 可查询且与 spans 关联

#### Scenario: 历史日志可回溯
- Given 上午时段的日志需查询
- When 按时间窗口检索 OO 日志
- Then 日志 SHALL 可回溯（不受容器 tail 容量限制）

### Requirement: R2: 时间约定
日志/验证脚本的时间窗口计算 SHALL 统一使用 UTC（epoch 微秒），业务时间（tradingDay/bucket/
capturedAt）按 Asia/Shanghai 展示，遵守 libs/timezone 既定约定。

#### Scenario: 窗口计算不因时区出错
- Given 脚本按本地时区计算 OO 查询窗口
- When 窗口跨日/跨时区
- Then 计算 SHALL 以 UTC 为基准，输出标注时区

### Requirement: R3: 查询方式文档
OO 日志/指标查询方式（stream 名、窗口微秒、type 参数）SHALL 被文档化，metrics 搜索窗口/
聚合行为 SHALL 有正确查询方式说明。

#### Scenario: 历史指标可查
- Given 需要查询上午时段的 skip/discard 计数
- When 按文档化的查询方式（正确窗口/聚合语义）
- Then 可取得对应时段数值，或明确该时段不可得的限制
