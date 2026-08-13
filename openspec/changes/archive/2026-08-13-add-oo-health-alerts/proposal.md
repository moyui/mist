# Proposal: add-oo-health-alerts

日期：2026-08-13
状态：proposed（待确认）

## 背景

2026-08-07 TDX 断流 56 分钟零感知（B4 盲区）——monitoring 时代的告警没有覆盖实时链路。
现在 OpenObserve 里信号已齐全（O1/O2a/gaps + retire-diagnostic-endpoints 的 WS 生命周期日志）：

- **42 个 metrics 流**：candle pipeline（sealed/skip/discard/due）、datasource
  （snapshot_accepted/age/ws_clients/startup_ok）、subscription（converged/desired/
  last_success_age）、backtest、nodejs runtime
- **logs**：WS 生命周期（connecting/connected/ready/disconnected/error）、candle
  ingest/skip/reject、reconcile failed
- **traces**：snapshot.process / due.finalize

但 **零告警规则消费这些信号**——"数据有了，哨兵没有"。

同时 deliver-strategy-notifications 已完成：`apps/notification` 的
`ChannelAdapter`（WeCom 群机器人 webhook + QQ NapCat）已在生产跑（mist-notification
healthy），投递渠道就绪。O3 复用该渠道（用户拍板统一，不走第二套投递）。

## 目标

1. **OO scheduled SQL alerts**（6 类，P0/P1/P2）检测实时链路异常（数据断流/WS 断连/
   订阅不收敛/pipeline 停/datasource 不健康/reject 飙升）。
2. 触发链路：OO alert → webhook → apps/notification `/internal/oo-alert-receiver`
   → isTradingSession 过滤 → 入独立 BullMQ queue（`oo-alert-delivery`，缓冲防雪崩）
   → worker 消费 → build infra envelope → `ChannelAdapter.send`（WeCom + QQ）。
3. 规则持久化：mist-deploy 存 alert 规则定义文件，compose 启动后 init 脚本经 OO API
   灌入（OO 容器重建可恢复）。

## 决策记录（2026-08-13 用户拍板）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 范围全做 P0/P1/P2（6 alert 项） | 全局告警，不只断流 |
| D2 | 持久化方案 A：mist-deploy 规则文件 + compose init 脚本灌 OO API | OO 重建不丢规则，可重复 |
| D3 | 渠道 B'：复用 `ChannelAdapter`，走**独立 BullMQ queue**（`oo-alert-delivery`，不混策略 `strategy-alert-delivery`） | 队列缓冲防雪崩（OO 告警突发不瞬时打爆 WeCom/QQ webhook）；复用现有 mist-realtime-redis + BullRegistrar 基建；不经策略 `AlertChannelDeliveryService`（无 Signal/AlertEvent evidence） |
| D4 | 交易时段过滤：`TimezoneService.isTradingDay` + `candle-bucket.util` session，receiver 端点过滤 | 非 gauge、非 SQL hour() 重复；backend 一处判定 |
| D5 | receiver 放 apps/notification（`/internal/oo-alert-receiver`） | adapter 所在，直接注入调用；避免跨 app HTTP |

渠道配置（用户补充拍板）：WeCom 用**独立 bot**（`OO_ALERT_WECHAT_WEBHOOK`，与策略
`NOTIFICATION_WECHAT_WEBHOOK` 隔离）；QQ 共用 `NOTIFICATION_QQ_*`（NapCat 单实例）；
配置放 `.env` 与策略同处，**聚合为后续独立 change**（本 change 只保证集中一处）。

## 范围

- **mist**：apps/notification 加 receiver endpoint + isTradingSession（注入
  libs/timezone TimezoneService + session 判定）+ `oo-alert-delivery` queue/worker +
  infra envelope builder + WeCom 独立 adapter 实例。
- **mist**：session 判定从 `candle-bucket.util` 提取到 libs/timezone（共享）。
- **mist-deploy**：OO alert 规则定义文件（6 项 SQL/窗口）+ init 脚本（compose
  启动后经 OO API 创建/更新，幂等）+ OO webhook destination 配置。

## 非目标

- 不动 deliver 的 `AlertChannelDeliveryService`/策略 BullMQ/AlertEvent 链路。
- 不做策略信号告警（那是 deliver 职责）。
- 不引入 OO 之外的告警通道。
- 不做 per-symbol 粒度告警（先 source 级，后续按需）。
- 渠道配置聚合（统一管理）为后续独立 change。

## 后续

- deliver-strategy-notifications 归档（独立，不阻塞 O3）。
- alert 阈值/窗口随实盘误报调优（规则文件一处改 + 重灌）。
