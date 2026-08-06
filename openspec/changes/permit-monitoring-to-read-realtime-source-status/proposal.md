## Why

2026-08-06 生产排查发现：backend `/internal/realtime/{tdx,qmt}/status`（含 `lastCapturedAt` /
`lastAcceptedAt` / `rejectCounts`）受 loopback guard 保护，只放行 `127.x` / `::1` / `localhost`。
`mist-monitoring` exporter 容器在 `mist-network` bridge 上是 backend 的网络 peer，访问时
`request.ip` 是容器 bridge IP（如 `172.18.0.x`），被 guard `403 Forbidden`。

这使 monitoring 无法把 backend `lastCapturedAt` 转成 Prometheus 指标
`mist_realtime_backend_last_captured_age_seconds{source}`。该指标是"datasource 推了 snapshot
但 backend 没收到 = backend WS 断/未订阅"这半段对照的关键，缺失导致定位这类问题只能跑 smoke
workflow + `docker exec` dump 日志。

已与 shadow HIL / candle productization 线程确认（2026-08-06）：

- guard 是**默认保守**，非文档化安全威胁模型；当初注释只说"NOT a product API. Loopback/admin only"。
- status payload 无敏感字段（`mode/schemaVersion/quality/connected/transportReady/lastAcceptedAt/
  lastCapturedAt/rejectCounts/lastReject/lastError`），无 token/密钥/业务数据。
- HIL 线程当前用 `docker exec mist-backend curl -fsS http://127.0.0.1:8001{path}` 绕过，永远命中
  loopback 分支；guard 放宽对 HIL 零影响（容器内 localhost 路径不变）。
- 单机 appliance 私有网络（`mist-network` bridge，不对外暴露），放宽风险低。

## What Changes

- **放宽 `requireRealtimeDiagnosticLoopback`**：在纯 loopback 之外，额外放行 `mist-network` bridge
  网段（`172.16.0.0/12`，覆盖 docker 默认 `172.17-31` 子网）。**网段级而非固定容器 IP**——docker
  重启后 bridge IP 会变。
- **明确放行端点集合**：guard 是共享函数，`/internal/realtime/{tdx,qmt}/*` 下所有 diagnostic
  端点（`status` + `:formatCode`）都走它。本 change 放宽的是该共享函数的判断逻辑，不改变端点集合。
- **新增 capability `realtime-diagnostic-access-control`**：约束"哪些来源可访问源级实时诊断端点"，
  使放行规则成为稳定契约而非隐式实现。
- 不改变端点返回的 payload 内容、不改 datasource、不改 monitoring 侧（monitoring 侧的指标消费
  由 `expose-realtime-freshness-and-diagnostic-windows` change 处理）。

## Capabilities

### New Capabilities

- `realtime-diagnostic-access-control`：定义源级实时诊断端点（`/internal/realtime/{tdx,qmt}/*`）
  的访问控制契约——loopback 永远放行 + `mist-network` bridge 网段放行 + 显式拒绝公网/其他来源。

### Modified Capabilities

None.

### Removed Capabilities

None.

## Dependencies

- **上游消费者**：`expose-realtime-freshness-and-diagnostic-windows`（mist-monitoring）的 A2 项
  依赖本 change 合并后才能把 `lastCapturedAt` 转成真指标；合并前 A2 标 not-exposed。
- **mist-monitoring 侧**：本 change 只放开 backend 端点访问；monitoring exporter 如何 parse
  `lastCapturedAt` 并 emit `mist_realtime_backend_last_captured_age_seconds{source}` 是
  monitoring change 的 task，不在本 change 范围。

## Impact

- **mist**：`apps/mist/src/realtime/realtime-diagnostic.guard.ts` 加网段判断（保留 loopback 分支，
  增 `mist-network` 网段放行）；guard 单测覆盖 loopback / bridge 网段 / 公网拒绝 三类。
- **mist-monitoring**：零改动（消费侧由 monitoring change 处理）。
- **mist-deploy**：零改动（`mist-network` 是现有 bridge 网络，无需新配置）。
- **mist-datasource**：零改动。
- **安全考量**：`mist-network` 是单台 Windows appliance 的 Docker bridge，不对外暴露；
  `status` payload 无敏感字段；放行仅限诊断读取，不含任何 mutation 端点。
