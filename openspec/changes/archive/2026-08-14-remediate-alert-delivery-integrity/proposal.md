# proposal: remediate-alert-delivery-integrity

## Why

2026-08-13 按 `project-quality-governance-guide.md` + `mist-backend-code-style-guide.md`
对全部告警改动（策略告警 `deliver-strategy-notifications` + 基础设施告警
`add-oo-health-alerts`）做质量审查，产出 3 中 5 低 findings，用户拍板开 change 全修：

| ID | 严重度 | 问题 |
|----|--------|------|
| M1 | 中 | spec tasks 2.8 承诺 `mist_oo_alert_total`（sent/failed）未实现就归档；O3 计数混入 `mist_notification_*`（语义写 strategy alert） |
| M2 | 中 | `live-strategy-persistence.service` 注释声称 "PENDING for later reconciliation sweep"，sweep 不存在——Redis 断时 enqueue 失败事件**永久 PENDING 永不投递** |
| M3 | 中 | `alert-fanout.service` `catch {}` 无差别吞 save 错误——DB 故障时 delivery 行未建仍入队 channel job → worker 查无行**静默丢弃** |
| L1 | 低 | O3 receiver `ts` 缺失时静默补当前时间（指南 §1 禁止），与 `alertName` 缺失 reject 不一致 |
| L2 | 低 | `strategy-alert-event.controller` 直接返回 TypeORM entity 作公共契约，无 VO（code-style §3/§4） |
| L3 | 低 | `POST /v1/notification/replay/:id` 走对外路径风格却无认证（容器内网接口）；对齐 `/internal/` 惯例，网络隔离即防线（用户拍板，不加 token） |
| L4 | 低 | receiver `SEVERITY_BY_PREFIX` 与 mist-deploy `rules.json` 规则名隐式耦合，无测试锁定 |
| L5 | 低 | `mist_notification_queue_depth` 只采样策略 queue，O3 queue 深度无观测 |

另有用户指出的**函数名两侧对齐**问题（详见 design §7）：内部方法动词不对称
（`markDelivery` vs `markDelivered/markFailed`、`String(adapter.channel)` vs
`toNotificationChannel`、`enqueue` vs `enqueue*` 系列）。

## What Changes

### 修复（不改变公共契约）

1. **M1**：新增 O3 专用计数器 + `mist_oo_alert_total` observable gauge
   （`status=sent|failed` 低基数 label），O3 worker 与策略计数完全隔离。
2. **M2**：`apps/notification` 新增 PENDING 恢复 sweep——周期扫描
   `strategy_alert_events` 中 `status=PENDING` 且超龄（≥5 分钟）且**无任何
   `strategy_alert_deliveries` 行**的事件，重新 enqueue fanout（jobId 幂等）。
3. **M3**：fanout `catch` 只吞 `ER_DUP_ENTRY`（精确约束名匹配），其他错误记日志并抛出。
4. **L1**：receiver `ts` 缺失直接拒绝（与 `alertName` 一致）。
5. **L2**：新增 `StrategyAlertEventVo`（`apps/mist/src/strategy/vo/`），controller
   全部响应映射 VO + Swagger `@ApiOkResponse`。
6. **L3**：replay 路径对齐 `/internal/notification/replay/:alertEventId`（与
   `/internal/oo-alert-receiver` 及退役诊断端点同模式——容器网络内访问，网络隔离即
   防线；无 host 端口暴露，用户拍板不加 token）。
7. **L4**：`sync-oo-alerts.ps1` apply 前校验 rules.json 每条 `name` 前缀与
   `severity` 字段映射一致（不符 throw）；`test-docker-compose-config.ps1` 加断言
   锁定该映射；receiver 单测覆盖 `SEVERITY_BY_PREFIX` 全表。
8. **L5**：`mist_notification_queue_depth` 加 `queue` label
   （`strategy`/`oo-alert`），Bootstrap 双 queue 采样。
9. **命名对齐**：`markDelivery`→`updateDeliveryStatus`、
   `OoAlertQueueService.enqueue`→`enqueueAlert`、O3 worker `String(adapter.channel)`
   →显式 `channelLabel()` 函数；共享 MySQL 唯一约束冲突识别提取为
   `isUniqueConstraintViolation(error, constraintName)`（signal + notification 复用）。

### 不变

- 公共契约不变：`@app/signal` V1 job 名/字段、queue 名、jobId 格式、channel 枚举、
  HTTP 路径、实体表结构、枚举值。
- 治理 §6.7 冻结项不变（AlertEvent 主表 4 态枚举、deliveries 子表 fan-out 语义）。
- 不新增数据库字段/migration（M2 sweep 只读 + 复用既有 enqueue 路径）。

## Impact

- **mist**：`apps/notification`（delivery + oo-alert + observability + replay 路径）、
  `apps/signal`（sweep 无关——M2 sweep 在 notification 侧；`isUniqueConstraintViolation`
  提取改 import）、`apps/mist`（VO + controller）、`libs/shared-data`（唯一冲突 util 提取）。
- **mist-deploy**：`sync-oo-alerts.ps1` 规则校验；`test-docker-compose-config.ps1`
  断言（rules.json 映射）。
- **监控**：指标语义修正（O3 独立 gauge + queue 深度双队列）——下游 OO 查询不受影响
  （新增指标，不改旧指标名；`mist_notification_*` 恢复纯策略语义）。

## Risks

- M2 sweep 与正常投递竞争：判据"无 delivery 行 + 超龄"严格排除在途事件；fanout jobId
  去重兜底，重复 enqueue 无害。
- L3 路径改名无消费者（fe 无调用、无外部调用方），纯内部契约；replay 仍靠容器网络
  隔离（无 host 端口）。
- 命名对齐均为内部/私有方法，无公共契约影响。
