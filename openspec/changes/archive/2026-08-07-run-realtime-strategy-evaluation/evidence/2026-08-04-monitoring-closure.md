# Realtime Strategy 6.2 Monitoring Closure

日期：2026-08-04

## 交付边界

- Signal raw health 保持 request-path dependency-free，只读取进程状态与 sampler snapshot。
- Signal 公开 process start、heap used/total/high-water、RSS、GC count/pause，以及 consumer removal、
  trading-day rollover 的低基数清理结果。
- candle owner 分开记录 live enqueue 与一次性 startup compensation；二者都不宣称 reconciliation。
- `mist-monitoring` 使用独立 Redis probe 读取固定 BullMQ state keys、Redis memory/AOF 和
  `maxmemory-policy`；不执行 key scan 或写命令。
- drain throughput 由 process-local processed counter 的时序 rate 派生；Redis retained depth 使用
  独立 queue probe，不混用两种计数。

## 提交

- `mist`: `54da319 feat(monitoring): expose realtime strategy runtime evidence`
- `mist-monitoring`: `3fe15e3 feat(monitoring): probe strategy queue capacity`
- `mist-deploy`: `a49bb2c feat(deploy): enable strategy Redis monitoring`

## 已执行验证

- Mist 定向 Jest：7 suites / 48 tests passed。
- Mist `pnpm run typecheck` passed；修改文件 ESLint 与 `git diff --check` passed。
- Monitoring `go test ./internal/probe ./internal/exporter ./internal/metrics` passed（真实 loopback fake
  Redis/HTTP server）；`go vet ./...` passed。
- Deploy `pwsh-preview -NoProfile -File scripts/test-docker-compose-config.ps1` passed。

完整仓库基线、真实 MySQL/Redis integration、strict OpenSpec、退役路径检索属于 6.3，未在本证据中
提前宣称完成。交易时段 shadow capacity 与 on promotion 仍属于 6.4/6.5。
