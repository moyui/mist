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

## 3. Phase 2：mock 环境（mist-datasource 仓 tools/mock-env/，全本机 + redis 单容器）

> v4 落位（用户逐项拍板 2026-08-07）：
> - **工具集整体放 mist-datasource 仓 `tools/mock-env/`**——注入器全部调用对象是 datasource
>   bridge 路由、fixture 在 tests/fixtures/ 本地、与现有 tools/qmt_runtime_probe 结构一致。
> - **全本机形态**：三仓（datasource/backend/monitoring）本机进程，仅 redis 一个 docker 容器，
>   无镜像 build、无 compose——三仓都可热重载/断点调试。
> - **mist/package.json 不加 mock scripts**（启动入口在 datasource 仓）。
> - mock 是链路验证工具，不是日常取数据/开发环境——仅用于验证指标语义，不做数据源、不做开发用途。
> - 详细代码级计划：`implementation-plan-phase2.md`（v4）。

- [ ] 3.1 `tools/mock-env/run-mock.sh`：编排（前置检查 → redis 容器 → datasource 双进程
      `uv run uvicorn` 9001/9002 → backend `pnpm start:debug` MIST_MOCK_MODE=true →
      exporter `go run` → 等健康）+ `tools/mock-env/stop-mock.sh`（pidfile 杀进程 + docker rm redis）。
- [ ] 3.2 `tools/mock-env/.env.mock`：MIST_MOCK_MODE=true、
      MIST_REALTIME_REDIS_URL=redis://127.0.0.1:6379/0、REALTIME_PRODUCTIZATION_MODE=shadow、
      REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on、REALTIME_STRATEGY_MODE=off、
      TDX_REALTIME_MODE=builtin、QMT_REALTIME_MODE=builtin、TDX/QMT allowlist 空。
- [ ] 3.3 `tools/mock-env/mock-drive.py`：注入器（扮演终端）——TDX：bridge owner→poll→result→
      snapshot（capturedAt 动态生成，暂停/恢复可控）；QMT：bridge owner→subscriptions
      poll/result→snapshot。fixture 只读引用 `tests/fixtures/tdx/live_market_snapshot_600519.json` +
      `tests/fixtures/realtime/realtime-native-frame-v2.json`（qmtOneEntry）。
- [ ] 3.4 `tools/mock-env/config.monitoring.yaml`：exporter 配置（target 127.0.0.1 三目标：
      backend candle health + tdx datasource + qmt datasource）。
- [ ] 3.5 `tools/mock-env/mock-verify.sh`：**全链路验证**（datasource→backend→candle 封存→
      exporter 指标）链路级断言（sealed 增长 / 暂停→discard 增长 / 恢复→自愈）。
      **具体指标断言矩阵待指标梳理完成后再定**（第二个独立计划），本阶段只锁链路级断言。
- [ ] 3.6 `tools/mock-env/README.md`：使用说明（前置依赖/启动/drive/verify/调试/清理）。
- [ ] 3.7 跑通闭环：注入→sealed 增长→链路断言全绿→暂停→discard 增长→恢复→自愈。
- [ ] 3.8 双源验证：TDX（600519.SH）+ QMT（300502.SZ）都注入一轮。

## 4. 不做（明确边界）

- [ ] ~~新增 MockAppModule / 第二 schema~~（单一 AppModule + Joi .when() 已消除双份维护）
- [ ] ~~mock 作为日常取数据/开发环境~~（mock 仅链路验证工具；开发/取数据走正常数据源与测试）
- [ ] ~~指标断言矩阵在本 change 定稿~~（待指标梳理计划完成后另行锁定）
- [ ] ~~跑 prometheus~~（验证直接 curl exporter /metrics；告警规则验证留到部署后）
- [ ] ~~signal shadow 评估~~（需要 mysql 策略表 + registry seed，第二轮扩展）
- [ ] ~~A2 指标 / 指标 rename~~（第二个独立计划）
- [ ] ~~动 Windows/生产配置~~（mock 纯本地 macOS）
- [ ] ~~改 monitoring/datasource/deploy 代码~~（mock 环境工具在 mist-datasource 仓
      tools/mock-env/，纯新增文件、零代码改动）
