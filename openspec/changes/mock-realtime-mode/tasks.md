## 1. 代码改动（单一 AppModule 方案）

- [x] 1.1 `libs/config/src/validation.schema.ts`：`mysql_server_host/username/password/database`
      4 个字段改为 `.when('MIST_MOCK_MODE', { is: 'true', then: Joi.optional(),
      otherwise: Joi.required() })`；追加 `MIST_MOCK_MODE: Joi.valid('true','false').default('false')`；
      文件底部（`resolveRealtimeStrategyMode` 旁）新增导出 `isMockMode()`（env 判断集中
      libs/config，不耦合业务代码——用户拍板；`app.module.ts` 与 `realtime-ingress.module.ts`
      均从 `@app/config` import，不各自定义）。
- [x] 1.2 `libs/config/src/validation.schema.spec.ts`：新增用例——
      mock（MIST_MOCK_MODE=true 无 mysql 变量）通过；生产（无该变量缺 mysql）仍失败；
      生产（有 mysql 变量）通过；`.custom()` queue/lifecycle 校验在 mock 下仍生效；
      `isMockMode()` 三态（true/false/未设）。
- [x] 1.3 `apps/mist/src/app.module.ts`：从 `@app/config` import `isMockMode`；新增
      `mockModeModulesForMode(isMock)` 条件展开（mock → `[]`；生产 → TypeOrmModule.forRootAsync +
      HistoricalCollector + RealtimeSubscription + Indicator + Security + Chan + Strategy）；
      AppModule imports 用它替换原来的直写列表；实时链路模块保持固定位置。
- [x] 1.4 `apps/mist/src/app.module.spec.ts`：新增断言——
      `mockModeModulesForMode(true)` 为 `[]`；`(false)` 含 TypeORM + 6 业务模块；
      **AppModule 在 MIST_MOCK_MODE=true 下启动测试（NestFactory.create 成功、端口监听、
      无 mysql 连接尝试；jest.resetModules + 动态 require）**。
- [x] 1.5 `apps/mist/src/realtime/realtime-ingress.module.ts`：从 `@app/config` import
      `isMockMode`；新增 `realtimePersistenceModulesForMode(isMock)`——mock 时跳过
      `TypeOrmModule.forFeature([SecuritySourceConfig])` + 提供内存空 repository
      （`useValue` 空对象，意外查询 fail-fast）；非 mock 保持现状。
- [x] 1.6 `apps/mist/src/main.ts`：**零改动**（验证确认无需分支）。

## 2. 校验

- [x] 2.1 `pnpm test`（jest，含 validation.schema.spec + app.module.spec 的 mock 启动）全绿。
- [x] 2.2 `pnpm typecheck` 全绿。
- [x] 2.3 `openspec validate mock-realtime-mode --strict` 通过。
- [x] 2.4 `openspec validate --all --strict` 通过（不破坏现有 specs）。
- [x] 2.5 `git diff --check` 无 whitespace 问题。

## 3. Phase 2：mock 环境（mist 仓，按资产类型拆分落位）

> 落位用户拍板（调研 NestJS 官方 + 本地三仓惯例）：**可执行脚本与数据资产分离**。
> - 脚本（run-mock.sh / mock-drive.py / mock-verify.sh）→ `tools/`（与 test-docker-runtime.sh 同类，
>   可挂 npm scripts）
> - 配置/帧数据（config.monitoring.yaml / .env.mock）→ `test/fixtures/mock/`（新建自有子目录，
>   不碰只读契约资产 test/fixtures/realtime/）
> - compose → `deploy/docker/docker-compose.mock.yml`
> **mock 是链路验证工具，不是日常取数据/开发环境**——仅用于验证指标语义，不做数据源、不做开发用途。

- [ ] 3.1 `deploy/docker/docker-compose.mock.yml`：redis 容器（redis:7-alpine）+ 可选 datasource 容器
      （第一轮 TDX 单源；也可本机 uv 进程，二选一以资源最省为准）。
- [ ] 3.2 `test/fixtures/mock/.env.mock`：MIST_MOCK_MODE=true、
      MIST_REALTIME_REDIS_URL=redis://127.0.0.1:6379/0、REALTIME_PRODUCTIZATION_MODE=shadow、
      REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on、TDX_REALTIME_MODE=builtin、QMT_REALTIME_MODE=off
      （第一轮）、REALTIME_STRATEGY_MODE=off。
- [ ] 3.3 `tools/run-mock.sh`（起 redis → 本机跑 backend MIST_MOCK_MODE=true → 本机/容器跑
      datasource → 本机跑 exporter）+ `tools/stop-mock.sh` + `test/fixtures/mock/config.monitoring.yaml`
      （target 地址 127.0.0.1）。挂 npm scripts（`"mock:start"` / `"mock:stop"`）。
- [ ] 3.4 `tools/mock-drive.py`：bridge owner 注册→收敛→POST snapshot（capturedAt 参数化、
      暂停/恢复可控），native 值取自 `test/fixtures/realtime/realtime-native-frame-v2.json`（只读引用）。
- [ ] 3.5 `tools/mock-verify.sh`：**全链路验证**（datasource→backend→candle 封存→exporter 指标）
      的链路跑通断言（sealed 增长 / 暂停→discard 增长 / 恢复→自愈）。
      **具体指标断言矩阵待指标梳理完成后再定**（第二个独立计划），本阶段只锁链路级断言。
- [ ] 3.6 跑通闭环：注入→sealed 增长→链路断言全绿→暂停→discard 增长→恢复→自愈。
- [ ] 3.7 QMT 第二轮：QMT_REALTIME_MODE=builtin + qmt bridge 订阅序列
      （复用 fixture qmtOneEntry）。

## 4. 不做（明确边界）

- [ ] ~~新增 MockAppModule / 第二 schema~~（单一 AppModule + Joi .when() 已消除双份维护）
- [ ] ~~mock 作为日常取数据/开发环境~~（mock 仅链路验证工具；开发/取数据走正常数据源与测试）
- [ ] ~~指标断言矩阵在本 change 定稿~~（待指标梳理计划完成后另行锁定）
- [ ] ~~跑 prometheus~~（验证直接 curl exporter /metrics；告警规则验证留到部署后）
- [ ] ~~signal shadow 评估~~（需要 mysql 策略表 + registry seed，第二轮扩展）
- [ ] ~~A2 指标 / 指标 rename~~（第二个独立计划）
- [ ] ~~动 Windows/生产配置~~（mock 纯本地 macOS）
- [ ] ~~改 monitoring/datasource/deploy 代码~~（mock 环境脚本在 mist 仓但零代码改动）
