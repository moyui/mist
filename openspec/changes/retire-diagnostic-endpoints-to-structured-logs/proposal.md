# Proposal: retire-diagnostic-endpoints-to-structured-logs

日期：2026-08-12
状态：proposed（待确认）

## 背景

2026-08-11 实盘排查"TDX snapshot 全部桶 no_snapshot"时，花费 30+ 分钟才确认
"backend 没问题，是终端脚本没重启"。根因：`TdxRealtimeClient.connect()` 的
WS 连接生命周期（connect/open/error/close）完全零日志，状态只维护在
`TdxRealtimeStore` 内存里，无日志出口、无 HTTP 出口、无 OTel span——排障时
只能靠"snapshot 是否还在流"反推，无法区分"backend 断连"与"终端没推"。

用户拍板（2026-08-12）：

> 以后尽量不要用诊断端点，通过日志来排查是最准的。把现有诊断端点改成日志，
> 然后把诊断端点下掉。

调查确认：诊断端点的大头**已被 shrink-monitoring-to-blackbox-probe 清完**
（`PermitMonitoring` guard 零命中、`realtime-diagnostic.controller.ts` 已删且
被 `realtime-source-layout.guard.spec.ts` 锁死、`/internal/realtime/*` 代码侧
不存在、NestJS 无 `/metrics`、lifecycle 诊断数据已迁 OTel gauge）。剩余候选
仅 5 个（见下）。

## 目标

1. **WS transport 生命周期结构化日志**（mist 仓，TDX + QMT 对称）：connect /
   open / ready / error / close / reconnecting 全部打结构化日志进 OpenObserve，
   携带 connectionId / wsUrl / errorMessage / lastMessageAt 等字段——解决
   误诊根因，让连接事件与 snapshot 流在日志中可见。
2. **snapshot ingest 日志扩 native 摘要字段**（mist 仓）：给已有的
   `candle ingest start` 日志补 `nativeKeys` / `asOf` / `volume` / `amount`，
   替代被删的 datasource evidence 端点（HIL 对账数据源）。频率特征不变
   （本就逐 snapshot 打日志）。
3. **下掉 `GET /providers`**（datasource TDX）：无生产消费方，仅 2 个测试引用。
4. **删除 `GET /tdx/bridge/evidence/{symbol}`**（datasource TDX）：datasource
   纯删除（端点 + `_native_evidence` 缓存 + `read_native_evidence`），不加
   evidence 日志、不节流——HIL 对账改走 backend snapshot 日志（见目标 2）。
5. **清理 mist-deploy 脚本 stale 引用**：`/internal/realtime/*` 残留注释/死代码、
   monitoring `MetricsUrl:9109` 残留（monitoring 仓已归档并删除本地）。

## 非目标（明确不做）

- 不动 health/readiness 端点：`/app/hello`（8001/8008）、`/health`（signal/
  backtest/datasource）、`/tdx|qmt/bridge/health`、`/qmt/realtime/health`——
  compose healthcheck、lifecycle coordinator、部署后健康检查强依赖，属正式能力。
- 不动 bridge 协议端点（`/owner /poll /result /snapshot /commands /subscriptions/*`
  loopback-only，实时桥接协议本体）。
- 不动 `POST /tdx|qmt/bridge/observability`——**这本身就是日志通道**（终端
  bridge 无 OTel SDK，靠它把计数 ingest 进 datasource 日志）。
- 不恢复任何 HTTP 诊断端点（shrink 的删除保持锁定）。
- 不逐 message 打日志（避免高频日志爆炸；snapshot 已有的逐条日志除外）。
- `POST /v1/raw/tdx/call` **保留**（用户拍板，见决策记录）。

## 决策记录（2026-08-12 用户拍板）

| # | 决策 | 理由 |
|---|---|---|
| D1 | `POST /v1/raw/tdx/call` 保留 | 主动调用 TDX SDK 的排查工具（被动日志无法替代"探测某方法是否可用"）；QMT **无类似端点**（`include_raw` 只是 bars/query 查询参数，非透传） |
| D2 | `GET /tdx/bridge/evidence/{symbol}` 删除；对账字段并入 backend snapshot 日志 | evidence 是"按需回读最近帧"——持续 datasource 日志要么高频爆炸、要么节流破坏"最近帧"时间精度；backend `candle ingest start` 本就逐 snapshot 打日志，补字段零频率成本，且语义可收窄为 decode/convert 层对账（传输层由 schema-v2 strict decoder + snapshot.process span 独立保障） |
| D3 | `GET /providers` 直接下 | 无生产消费方，仅测试 |
| D4 | 端点清理与 WS 日志合并为一个 change | 同一方向的两面：端点是旧观测手段（拆除），日志是新手段（补位） |
| D5 | WS 走日志（不建 span/gauge） | 与用户"日志排查最准"一致；span 关联留待后续按需 |
| D6 | mist-monitoring 本地仓删除 | 已 GitHub archived（7634f51 标记 DEPRECATED），本地删除避免影响判断（已执行 2026-08-12） |

## 后续（归档后）

- 若未来需要主动告警（断连不靠人发现），再按需增加 gauge/告警规则（L3 层，
  当前不做）。
- 前端 `useConnectionStatus` 的 phantom `/api/mist/health` 探针（404 回退
  online）不在本 change 范围，另行处置。
