# Signal Deployment Wiring（2026-08-04）

## Version set

- `mist`：`feat/run-realtime-strategy-evaluation`，共享镜像执行 `pnpm run build:docker` 时包含
  `nest build signal`，产物入口为 `dist/apps/signal/main.js`。
- `mist-deploy`：`feat/run-realtime-strategy-evaluation@b7557e1`，独立 clean worktree。

## Accepted topology

- Compose service 为 `signal`，container 为 `mist-signal`，复用 `MIST_IMAGE:MIST_IMAGE_TAG`。
- HTTP `8010` 与 TCP RPC `9010` 只在 Compose 网络内使用，不发布 Windows host port，也不加入
  web-gateway route。
- Signal 只依赖 healthy MySQL 与 `mist-realtime-redis`；backend 和 Signal 同一 application batch
  启动但互不等待 health。
- backend 使用 `SIGNAL_RPC_HOST=signal`、`SIGNAL_RPC_PORT=9010`。
- `REALTIME_STRATEGY_MODE=off` 为默认；off 不构造 realtime BullMQ/market reader。
- market 与 BullMQ 复用单机 Redis endpoint，但使用不同 namespace、connection owner；没有新增
  `mist-queue-redis`、volume 或 `MIST_QUEUE_REDIS_URL`。
- Signal raw healthcheck 只验证 HTTP 200、`status=ok`、`instance=signal` 与合法 mode；nested degraded
  由 monitoring 判断，不把进程存活和 capability readiness 混为一体。

## Automated verification

- `pwsh-preview -NoProfile -File scripts/test-docker-compose-config.ps1`：通过。
- `docker compose --env-file docker/.env.example -f docker/compose.yaml config --quiet`：通过。
- `git diff --check`：通过。

本证据只完成部署契约，不代表 Windows 实机部署、shadow HIL 或 on promotion 已完成。
