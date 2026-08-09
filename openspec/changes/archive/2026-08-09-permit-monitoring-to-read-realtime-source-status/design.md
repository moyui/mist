## Context

backend `/internal/realtime/{tdx,qmt}/status` 受 `requireRealtimeDiagnosticLoopback` 保护，只放行
loopback。这阻断 `mist-monitoring` exporter 容器（在 `mist-network` bridge 上）读取 backend
`lastCapturedAt`，使其无法转成 Prometheus 指标。

### 基线核实

- guard 文件：`apps/mist/src/realtime/realtime-diagnostic.guard.ts`（2026-08-06 核实）
- 应用点：`sources/{tdx,qmt}/realtime/realtime-diagnostic.controller.ts` 的 `status` 和 `:formatCode`
- 现状：`request.ip` normalize（剥 `::ffff:`）→ 只放行 `localhost` / `::1` / `127.x`，其余 `403`
- payload 无敏感字段（见 proposal）
- HIL 线程用 `docker exec ... curl 127.0.0.1` 绕过，不受影响
- `mist-network` 是 docker bridge，默认子网 `172.17-31.x.x`（属 `172.16.0.0/12`）

## Goals / Non-Goals

### Goals

- 让 monitoring exporter 容器能读 backend 源级 diagnostic，使 `lastCapturedAt` 可转指标。
- 把"谁能访问源级诊断"做成稳定契约（capability），而非隐式实现。

### Non-Goals

- 不改 payload 内容、不加端点、不做 mutation。
- 不动 monitoring 侧的指标消费（上游 monitoring change 的 task）。
- 不处理 `candles/status` / `subscriptions/status`——它们**不受 guard**（HIL 路径，已可访问），
  本 change 只管源级 `tdx/qmt/status`。

## Decisions

### 1. 网段级放行，而非固定 IP

docker 重启后容器 bridge IP 会变（`172.18.0.x` → 可能 `172.19.0.x`）。固定 IP 会在重启后失效。
放行 `172.16.0.0/12`（覆盖 docker 默认所有 bridge 子网）才稳定。

### 2. 为什么不直接改 monitoring-health-alerts 的 Req 7

`monitoring-health-alerts` Req 7「Loopback realtime health is proxied by Windows metrics」的语义是
**消费侧不直接调 loopback，走 metrics**——它是"Mac watchdog 通过 Windows metrics 间接消费"的设计。
而本 change 是"放开 loopback 让 monitoring 直接读"——方向相反，语义冲突。改那条会动摇其意图，
且有 5 个活跃 delta 在飞（撞 archive）。故新建独立 capability `realtime-diagnostic-access-control`，
纯 ADDED，零冲突。

### 3. CIDR 判断实现

Node `net` 无内置 CIDR 判断，但 `ip-cidr` 依赖过重。用 `isIP` + 手写 `172.16.0.0/12` 判断即可
（前 12 bit 匹配 `10101100 0001xxxx`）。保持零新依赖。

## Risks / Trade-offs

- **放宽了访问面**：原来只有 loopback 能读，现在整个 `mist-network` 能读。缓解：单机 appliance
  私有网络不对外；payload 无敏感字段；只读无 mutation；公网仍 403。
- **网段假设**：`172.16.0.0/12` 假设 docker 用默认 bridge 子网。若 operator 改了 docker 子网
  （如用 `10.x`），需同步调整。缓解：docs/config 说明该假设；spec scenario 明确 CIDR。
- **guard 函数改名**：`requireRealtimeDiagnosticLoopback` 名字会变得不准确（不再只 loopback）。
  缓解：重命名为 `requireRealtimeDiagnosticAdmission` 或保留原名 + 注释；本 change 接受任一选择。

## Migration Plan

1. 改 guard 加网段分支（保留 loopback）。
2. guard 单测覆盖 loopback / bridge 网段 / 公网拒绝。
3. 合并后，通知 monitoring change 的 owner 把 A2 从 not-exposed 升级为真指标。
