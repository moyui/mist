# Realtime Strategy 6.3 Full Baseline And Real Dependencies

日期：2026-08-04

## 固定提交

- `mist` master: `652be8ca21e0fbfc9ca51b9bc1c3bbe2d870577b`
- `mist-monitoring` master: `e5231741dfc3ec97941c2421a3eb1385f2170a5a`
- `mist-deploy` master: `85c541c59d6e39efcbaa84dc9915ebdde3fb00db`
- 三仓工作区在证据完成前均通过 `git diff --check`；`REALTIME_STRATEGY_MODE` 部署默认值保持 `off`。

## Mist 完整基线

- `pnpm run lint:check`: passed。
- `pnpm run typecheck`: passed。
- `env TZ=UTC MIST_TEST_MYSQL_URL=... pnpm run test:ci`: 134 suites / 1075 tests passed，包含真实
  MySQL gate。
- `pnpm run ci:contracts`: passed；同时修正 CI contract runner 在 Git worktree 中错误定位 repo 的问题。
- `pnpm run build:docker`: `mist`、`chan`、`signal`、`realtime-subscription-hil` 全部编译通过。
- `openspec validate --all --strict`: 66 items passed，0 failed。

完整测试第一次执行发现并修复两项前序 contract 漂移：Signal hybrid TCP 必须显式
`inheritAppConfig:false`，Docker build contract 必须包含 `nest build signal`。修复后完整基线重跑通过。

## 真实 MySQL 8.4

使用明确命名、`--rm`、tmpfs 的临时 MySQL 8.4 实例，不读取或写入现有业务数据：

- migration runner 按顺序成功应用 `001_init_core_tables.sql` 至
  `014_evolve_strategy_evaluation_contract.sql`；`schema_migrations` 共 14 行。
- `k-decimal.mysql.spec.ts` 与 `strategy-alert-event.mysql.spec.ts`: 2 suites / 3 tests passed。
- 证明 `k.volume/amount` 为 nullable `decimal(36,8)`，exact decimal/null roundtrip 正常，且
  `uq_strategy_alert_events_dedupe_key` 为 named unique owner。

## 真实 Redis 7.4

使用明确命名、`--rm`、tmpfs 的临时 Redis 7.4 实例，配置 `appendonly yes`、`appendfsync everysec`、
`maxmemory-policy noeviction`：

- 固定 BullMQ keys 写入 waiting/active/completed/failed = `2/1/3/1` fixture。
- `TestStrategyRedisRealRedisGate` 通过，读取结果精确为 `2/1/3/1`。
- 最终 evidence: `aof_enabled=1`、`aof_last_write_status=ok`、`aof_current_size=355`、
  `maxmemory-policy=noeviction`。
- probe 只执行固定 `INFO`、`CONFIG GET`、`LLEN`、`ZCARD`，不执行 `KEYS`、`SCAN` 或写命令。

## Mist Monitoring 完整基线

- `bash scripts/verify.sh` with real Redis env: passed。
- Python metrics contract: 8 tests passed。
- monitoring strict OpenSpec: 4 items passed。
- `gofmt`、`go vet ./...`、`go test ./...`: passed；全量 Go tests 包含真实 Redis gate。

## Mist Deploy 完整基线

- 35 个纯 contract/unit `scripts/test-*.ps1` 全部通过。
- `test-mysql-backup-restore.ps1` 是会读取真实备份并启动恢复容器的运维 HIL，不是纯测试；当前 macOS
  没有默认 Windows `E:` drive/生产备份，因此明确记录为环境阻塞，不把它算作本 change 失败或通过。
- 直接受影响的 Compose、deployment、monitoring deployment、health-check、defaults tests 全部通过。
- deploy strict OpenSpec: 4 items passed。

## 退役路径检索

排除 `*.spec.ts` negative tests 后，以下 production 范围检索均为零：

- `StrategyScanController|StrategyScanService|RunStrategyScanDto|strategy-scans/run`；
- `snapshot_update|MIST_QUEUE_REDIS_URL|mist-queue-redis|TDX_SUBSCRIBE_ALLOWLIST_ON_READY`；
- Signal runtime/contract 中的 `securityCode|providerSymbol`；
- Chan persistence Entity/repository/TypeORM registration。

stable specs 中仍保留旧 manual scan requirement，active delta 已明确删除；它会在本 change 完成 6.4/6.5
并归档时由 OpenSpec 合并，不把 stable/active 双态误报为 production code 残留。

## 未完成门禁

- 6.4 交易时段 shadow：restart、missing/duplicate/conflict、listener-bound memory、各周期 timestamp 与
  TDX/QMT quantity profile。
- 6.5 项目负责人审核与 on-mode HIL。
- 本证据不宣称 production HIL、容量验收或 on promotion 已完成。
