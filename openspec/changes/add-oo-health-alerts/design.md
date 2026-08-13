# Design: add-oo-health-alerts

## 1. 架构（数据流）

```
OO scheduled SQL alert（6 类，全天跑）
   │ 触发 → webhook destination（POST 到 receiver）
   ▼
apps/notification /internal/oo-alert-receiver
   │
   ├─ 认证：X-Oo-Alert-Token（mist-deploy secret，OO destination 带 header）
   ├─ parse OO alert payload（alertName + 查询触发行 + 时间）
   ├─ isTradingSession(now)?
   │   = TimezoneService.isTradingDay(now) && sessionInHours(now)
   │   ├ 否（非交易时段）→ 静默丢弃（记 info 日志）
   │   └ 是 → BullMQ queue.add('oo-alert-delivery', job)（jobId 去重，防风暴）
   │
   ▼
BullMQ `oo-alert-delivery` queue（独立，不混策略 strategy-alert-delivery）
   │
   ▼
apps/notification worker（消费 oo-alert-delivery job）
   ├ build infra NotificationEnvelope
   └ fan-out：独立 WeCom adapter（OO_ALERT_WECHAT_WEBHOOK）+ 共用 QqChannelAdapter
       （NOTIFICATION_QQ_*，仅当 NOTIFICATION_CHANNELS 含 qq）
```

**队列缓冲防雪崩**（D3）：OO 告警突发（如断流 + 多源同时触发）经独立 queue
缓冲，worker 串行/低并发消费，不会瞬时打爆 WeCom/QQ webhook。queue 复用现有
`mist-realtime-redis`（deliver 同源）+ BullRegistrar 注册模式；**独立 queue name**
（`oo-alert-delivery`），与策略 `strategy-alert-delivery` 完全隔离。
**jobId 去重**（`alertName:windowStart`）：同一 alert 同一时间窗口只入队一次，
持续断流不刷屏。

**不经策略 `AlertChannelDeliveryService`**：O3 是基础设施告警（无 Signal/
AlertEvent evidence），不复用策略的 per-channel delivery/AlertEvent reconcile。

## 2. Alert 项（6 类，OO scheduled SQL）

交易时段过滤在 receiver（D4），OO SQL 全天跑。OO scheduled alert 形态：
`SELECT` 查询 + frequency（分钟级）+ condition（值/存在性）。精确 SQL 语法落地时
对齐 OO scheduled-alert 文档；下表是草案（信号 + 窗口 + 触发条件）。

| # | 优先级 | 检测 | 信号流 | 窗口 | 触发条件（草案） |
|---|---|---|---|---|---|
| A1 | P0 | 数据断流 | `mist_datasource_snapshot_accepted_total`（per source Counter）| 5min | 交易时段窗口内 value 无增长；**备选**：`mist_datasource_snapshot_age_seconds > 阈值`（若 OO 不支持变化检测，落地定）|
| A2 | P0 | WS 断连 | `mist_datasource_ws_clients` / log `tdx\|qmt realtime ws event=disconnected willReconnect=true` | 5min | ws_clients 掉到 0 或 disconnected 日志出现 |
| A3 | P1 | 订阅不收敛 | `mist_realtime_subscription_converged_count` vs `desired_count` + `last_success_age_seconds` | 10min | converged < desired 持续 或 last_success_age > 阈值 |
| A4 | P1 | pipeline 停 | `mist_candle_sealed_total` | 5min | 交易时段 sealed 无增长；**备选**：sealed 最近封存时间 age > 阈值 |
| A5 | P2 | datasource 不健康 | `mist_datasource_startup_ok`（absent after crash）+ `nodejs_eventloop_delay_p99` | 10min | startup_ok 消失 或 eventloop p99 > 阈值 |
| A6 | P2 | reject/skip 飙升 | `mist_datasource_snapshot_rejected_total` / `mist_candle_skip_total` | 10min | 窗口内增长率 > 阈值 |

注意：A1/A4（"不增即异常"）依赖 receiver 交易时段过滤（盘后不增正常，不会触发）；
若 OO alert 不支持"变化/对比窗口"检测，落地改 age-based（备选列）。

## 3. Receiver、queue 与 worker（apps/notification）

### 3.1 Receiver endpoint

**端点**：`POST /internal/oo-alert-receiver`（NestJS controller，注册进
notification-app.module 或新 oo-alert.module）
- 认证：`X-Oo-Alert-Token` header（mist-deploy secret 注入，compose env；OO webhook
  destination 配置该 header）——与 OO 凭据隔离。
- payload：OO alert webhook（alertName + 查询结果行 + 触发时间），落地时对齐 OO
  destination payload 格式；receiver 只取 alertName + 关键字段。
- 处理：token 校验 → parse → `isTradingSession(now)`：
  - 非交易时段 → 丢弃（info 日志，返回 200）
  - 交易时段 → `queue.add('oo-alert-delivery', job, {jobId})`（去重）→ 202。
    queue.add 失败 → 记 error（不丢 alert：重试或落日志）。

### 3.2 BullMQ `oo-alert-delivery` queue

- 复用 `mist-realtime-redis`（deliver 同 connection 模式 + 独立 prefix/queue name）。
- job 结构：`OoAlertJobV1 { alertName, source?, severity, ts, summary }`
  （channel-neutral）。
- 注册：BullRegistrar 模式（deliver 的 worker 注册方式），`manualRegistration` 对齐
  deliver 现有配置。
- retry：attempts 3 + 指数退避——失败 throw 走 BullMQ retry，耗尽 → 失败日志/计数。
  不做策略告警的复杂 per-channel 状态机。

### 3.3 Worker（消费 oo-alert-delivery）

- 新 handler：job → `buildInfraEnvelope(job)` → fan-out：
  - **WeCom**：独立 `WeComChannelAdapter` 实例（读 `OO_ALERT_WECHAT_WEBHOOK`，
    与策略 bot `NOTIFICATION_WECHAT_WEBHOOK` 隔离）。
  - **QQ**：**直接注入 `QqChannelAdapter` 单例**（不经 `CHANNEL_ADAPTERS` 过滤后的
    数组——那是策略按 NOTIFICATION_CHANNELS 过滤的）；worker 自己读
    `NOTIFICATION_CHANNELS` 判断是否发 QQ（当前 wechat only → 只发 WeCom）。
- 失败：`send` 抛错 → throw（BullMQ retry）；adapter 返回 permanent_failure →
  记日志 + 计数（不重试）。
- 计数：`mist_oo_alert_total`（sent/failed，低基数 label）——落地时加。

### 3.4 O3 渠道配置位置与聚合规划

- O3 渠道配置（`OO_ALERT_WECHAT_WEBHOOK` + `OO_ALERT_RECEIVER_TOKEN`）放
  `F:\MistDocker\.env`，与策略渠道（`NOTIFICATION_*`）**同处**（现状，
  compose env 注入 notification 容器，adapter 读 env）。
- QQ 复用 `NOTIFICATION_QQ_*`（NapCat 单实例，无法独立）。
- **聚合规划**：当前渠道配置分散在 .env（策略 + O3）；未来统一到集中配置
  管理（如配置中心/统一 bot 管理），本 change 只保证配置集中一处（.env），
  聚合为后续独立 change（不做）。

### 3.5 isTradingSession(now)

- `TimezoneService.isTradingDay(now)`（libs/timezone，SZSE API + weekend fallback + cache）。
- `sessionInHours(now)`：A 股时段（09:30-11:31 / 13:00-15:01，half-open，对齐
  candle-bucket.util 常量）。实现：从 `apps/mist/src/realtime/candle/candle-bucket.util.ts`
  提取时段判定到 `libs/timezone`（`trading-session.util.ts`），candle-bucket.util
  引用共享常量（避免双源）。

## 4. 持久化（mist-deploy）

- **规则文件**：`mist-deploy/oo-alerts/rules.json`（6 项：name + severity + stream +
  sql + frequency + window + condition）+ `destinations.json`（webhook → receiver URL +
  `X-Oo-Alert-Token` header）。
- **init 脚本**：`scripts/sync-oo-alerts.ps1`——compose 启动后（或部署后）调 OO
  REST API 创建/更新 destination + alert（幂等：存在则更新）。OO alert 创建 API
  路径落地时确认（之前 `/api/default/alerts` 404，可能 per-stream 或方法差异）。
  OO API 认证：读 .env `OO_ROOT_USER_PASSWORD`（Basic auth），脚本不落凭据。
- compose 或 deploy workflow 调用 init 脚本（openobserve healthy 后）。
- **渠道配置**（§3.4）：`OO_ALERT_WECHAT_WEBHOOK`（独立 bot）+ `OO_ALERT_RECEIVER_TOKEN`
  放 .env；QQ 复用 `NOTIFICATION_QQ_*`。`.env.example` + 部署脚本同步（G2 惯例：
  git 零凭据）。

## 5. 验证路径

- receiver 单测：token 认证、isTradingSession 过滤（交易入队/非交易丢弃）、
  queue.add 调用 + jobId 去重（mock Queue）。
- worker 单测：消费 job → envelope builder → adapter 调用（mock）、throw 走 retry、
  permanent_failure 计数、QQ 未启用只发 WeCom。
- session 单测：09:30/11:30/13:00/15:00 边界、午休、盘后/周末。
- init 脚本 dry-run：规则文件 → OO API 幂等创建（本地/生产验证）。
- 生产 HIL：交易时段注入"断流"（临时停 TDX 推送或 mock）→ OO alert 触发 →
  queue → worker → 微信/QQ 收到；非交易时段触发被静默丢弃。
- OO alert 规则可重建：删 OO alert → init 脚本重灌 → 恢复。

## 6. 跨仓影响面

| 仓库 | 改动 |
|---|---|
| mist | apps/notification receiver + oo-alert-delivery queue/worker + isTradingSession + envelope（+ libs/timezone trading-session.util） |
| mist-deploy | OO 规则文件 + sync-oo-alerts.ps1 + 部署接入（**docker_root=F:\MistDocker**） |
| mist-datasource | 无 |
| deliver | 无（只复用 ChannelAdapter + BullMQ 基建模式） |

无数据库、无 wire contract 变化 → 不需要 migration。
