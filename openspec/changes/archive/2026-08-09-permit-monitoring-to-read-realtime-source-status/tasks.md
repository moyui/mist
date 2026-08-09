# permit-monitoring-to-read-realtime-source-status — Tasks

> 基线：mist master `fadc0e0`（2026-08-06）。
> 注意：实施待外部排期（用户确认"现在没法做"），本 tasks 是就绪待执行的清单。

## 1. guard 放宽

- [ ] 1.1 [mist] `apps/mist/src/realtime/realtime-diagnostic.guard.ts`：保留 loopback 分支，
      新增 `mist-network` bridge 网段放行（`172.16.0.0/12`，覆盖 docker 默认 bridge 子网）。
      判断用 `isIP` + 手写 CIDR（前 12 bit 匹配 `10101100 0001xxxx`），保持零新依赖。
- [ ] 1.2 [mist] guard 函数名：`requireRealtimeDiagnosticLoopback` → `requireRealtimeDiagnosticAdmission`
      （或保留原名 + 注释说明不再只 loopback）。两处 controller 调用同步更新。
- [ ] 1.3 [mist] 单测覆盖三类 origin：
      - loopback（`127.0.0.1` / `::1` / `localhost` / `::ffff:127.0.0.1`）→ 放行
      - bridge 网段（`172.17.0.1` / `172.18.0.x` / `172.31.255.255`）→ 放行
      - 公网/其他（`8.8.8.8` / `10.0.0.1` / `192.168.1.1`）→ 403

## 2. 校验

- [ ] 2.1 [mist] 现有 realtime diagnostic controller 单测不破坏（loopback 路径行为不变）。
- [ ] 2.2 [mist] `openspec validate permit-monitoring-to-read-realtime-source-status --strict` 通过。
- [ ] 2.3 [mist] `openspec validate --all --strict` 通过（新 capability 不破坏现有 specs）。

## 3. 合并后联动

- [ ] 3.1 通知 `expose-realtime-freshness-and-diagnostic-windows`（mist-monitoring）的 owner：
      A2 可从 not-exposed 升级为真指标
      `mist_realtime_backend_last_captured_age_seconds{source}`（parse `lastCapturedAt`）。
- [ ] 3.2 [mist-monitoring] A2 docs 同步更新（去掉 not-exposed 标注，加新指标说明）。
