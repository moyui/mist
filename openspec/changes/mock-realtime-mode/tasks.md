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

- [x] 3.1 `tools/mock-env/run-mock.sh`：编排（前置检查 → redis 容器（7.4-alpine + AOF）→
      datasource 双进程 `uv run uvicorn` 9001/9002 → backend `pnpm start:dev` MIST_MOCK_MODE=true →
      exporter `go run` → 等健康）+ `tools/mock-env/stop-mock.sh`（**递归杀进程树**，pnpm 子进程链）。
- [x] 3.2 `tools/mock-env/.env.mock`：MIST_MOCK_MODE=true、
      MIST_REALTIME_REDIS_URL=redis://127.0.0.1:6379/0、REALTIME_PRODUCTIZATION_MODE=shadow、
      **REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off**、REALTIME_STRATEGY_MODE=off、
      TDX_REALTIME_MODE=builtin、QMT_REALTIME_MODE=builtin、
      **TDX_REALTIME_ALLOWLIST=600519.SH、QMT_REALTIME_ALLOWLIST=300502.SZ**（Step H 后非空）。
- [x] 3.3 `tools/mock-env/mock-drive.py`：注入器（扮演终端）——TDX：bridge owner→poll→result→
      snapshot（capturedAt 动态生成，暂停/恢复可控）；QMT：**探测式**（订阅已存在直接推帧）+
      subscriptions poll/result→snapshot；**TDX eventTime 取 capturedAt，QMT 取 native.timetag
      （注入器同步改写）**。fixture 只读引用 `tests/fixtures/tdx/live_market_snapshot_600519.json` +
      `tests/fixtures/realtime/realtime-native-frame-v2.json`（qmtOneEntry）。
- [x] 3.4 `tools/mock-env/config.monitoring.yaml`：exporter 配置（target 127.0.0.1 四目标：
      backend hello + candle health + tdx datasource + qmt datasource）。
- [x] 3.5 `tools/mock-env/mock-verify.sh`：**两态链路验证**——帧持续到达（24/7）+ 聚合候选 +
      sealed 增长（交易时段 due 到期自动断言）；macOS 系统代理绕过。
      **具体指标断言矩阵待指标梳理完成后再定**（第二个独立计划），本阶段只锁链路级断言。
- [x] 3.6 `tools/mock-env/README.md`：使用说明（前置依赖/启动/drive/verify/调试/清理/
      **注入时间语义/已知事项（exporter 契约漂移）**）。
- [x] 3.7 跑通闭环：**聚合层全链路已验证**（注入→backend 收帧→聚合候选，双源）；
      **sealed 增长/暂停→discard/恢复→自愈 留交易时段 HIL**（due 是墙钟驱动）。
- [x] 3.8 双源验证：TDX（600519.SH）+ QMT（300502.SZ）都注入一轮且聚合成功。

## 5. Step H：mock 模式订阅驱动（2026-08-08 用户拍板：lifecycle=off + env allowlist 内存解析）

> 背景（代码实证）：mock 模式跳过 RealtimeSubscriptionModule → coordinator（生产唯一
> sync 调用者）不加载 → backend 不发 sync_subscriptions → datasource 广播不推给 backend，
> candle 链路在入口断。用户拍板：**订阅不模拟**（终端/收敛/desired 是真机行为），
> 订阅走真实机制（allowlist env 内存解析 + backend 真实 sync），mock 只注入上游数据。

- [x] 5.1 `realtime-security-allowlist.service.ts`：`initialize()` 加 mock 分支——`isMockMode()`
      时 env 非空直接内存构造 `{formatCode, securityId: 1}`（不查库，无视 lifecycle）。
- [x] 5.2 `sources/{tdx,qmt}/realtime/realtime.client.ts`：`handleReady()` 末尾 mock 分支——
      `syncSubscriptions(allowlist.entriesList formatCodes)`（生产 coordinator 同机制，重连幂等）。
- [x] 5.3 `.env.mock`：lifecycle=off + TDX/QMT allowlist 非空（Joi off+非空合法）。
- [x] 5.4 `mock-drive.py`：删 WS sync 控制面（订阅由 backend 真实驱动），保留 bridge 推帧。
- [x] 5.5 单测：schema off+allowlist 合法 / allowlist mock 分支（有/无 env，不查库）/
      client mock ready 后 sync（tdx+qmt）、非 mock 不调。
- [x] 5.6 校验：相关 spec 全绿 + typecheck + openspec validate --all --strict（68 项）。
- [x] 5.7 实测：TDX/QMT 双源全链路打通（真实订阅→注入→聚合），`mock-verify.sh` 全绿。

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
