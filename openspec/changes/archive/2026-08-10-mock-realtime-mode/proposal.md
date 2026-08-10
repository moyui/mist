## Why

macOS 本地验证实时链路指标语义（sealed/discard/queue/redis 等）需要 backend 可运行，但 backend
当前无条件依赖 mysql（Joi `mysql_server_*` required + TypeORM 默认 9×3s 重试 fail-fast），且附带
chan/schedule/策略/collector 等业务模块——本地 mock 要起 mysql + 全模块，资源重、链路杂。
实时链路本身（snapshot→candle 聚合→Redis 封存→health）零 DB 读（allowlist 为空时不查库，
`realtime-security-allowlist.service.ts:75-79`），只差一个无 mysql 的启动路径。

## What Changes

- 新增 `MIST_MOCK_MODE=true` 环境变量：mock 时跳过 TypeORM/MySQL 和业务模块
  （HistoricalCollector/RealtimeSubscription/Indicator/Security/Chan/Strategy），
  保留实时链路模块（HttpTransport/Config/Throttler + TDX/QMT realtime + RealtimeIngress）。
- **单一 AppModule，不新增模块类**：`app.module.ts` 加 `mockModeModulesForMode(isMock)` 条件展开
  （mock → `[]`；生产 → `[TypeOrmModule.forRootAsync, 6 个业务模块]`），main.ts 无分支。
- **单一 schema，不新增 schema**：`validation.schema.ts` 用 Joi `.when('MIST_MOCK_MODE')`
  把 `mysql_server_*` 从 required 条件化为 optional（生产不设该变量 → 仍 required，零回归）。
- `RealtimeIngressModule` mock 时跳过 `SecuritySourceConfig` forFeature，用内存 allowlist
  （allowlist env 为空时本就不查库，mock 给空 map 假 repo）。
- 默认关闭：不设 `MIST_MOCK_MODE` 即现有行为，零回归。
- Redis 仍必须：`MIST_REALTIME_REDIS_URL` 空时 `handleSnapshot` 三处短路，
  sealed/discard 恒 0，无法验证封存。

## Capabilities

### New Capabilities

- `mock-realtime-mode`：定义 backend mock 模式契约——无 mysql 启动、仅实时链路模块、
  内存 allowlist、redis 必须、默认关闭。

### Modified Capabilities

None.

### Removed Capabilities

None.

## Impact

- **mist**：`libs/config/src/validation.schema.ts`（Joi .when 条件化 mysql_server_* + spec）、
  `apps/mist/src/app.module.ts`（mockModeModulesForMode + spec）、
  `apps/mist/src/realtime/realtime-ingress.module.ts`（realtimePersistenceModulesForMode + 内存 allowlist）、
  `apps/mist/src/main.ts`（零改动——mock 与否由 env 决定，与 tdxRealtimeModulesForMode 同模式）。
- **mist-datasource**：Phase 2 mock 环境落于此仓——`tools/mock-env/`（run-mock.sh /
  stop-mock.sh / mock-drive.py / mock-verify.sh / .env.mock / config.monitoring.yaml / README.md），
  纯新增文件、零代码改动。全本机形态（三仓本机进程 + redis 单容器），无 compose、无镜像 build；
  注入器扮演终端经 bridge HTTP 推真实 fixture（tests/fixtures/ 只读引用）。
- **mist-monitoring / mist-deploy**：零改动（mock 环境只做链路验证，
  不是日常取数据/开发方式；指标断言矩阵待指标梳理计划完成后再定）。

## Dependencies

- **Redis**：mock 模式验证 candle 封存必须 `MIST_REALTIME_REDIS_URL` 非空 +
  `REALTIME_PRODUCTIZATION_MODE=shadow`；无 redis 时仅能验证 health 形状与 degraded 逻辑。
- **monitoring exporter**：mock 验证直接 curl `/metrics` 断言指标语义，不依赖 prometheus。
