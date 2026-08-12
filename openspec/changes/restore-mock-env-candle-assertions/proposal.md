# Proposal: restore-mock-env-candle-assertions

日期：2026-08-12
状态：proposed（待确认）

## 背景

`mist-datasource/tools/mock-env/` 是实时行情链路的本地全链路验证环境。它的主体已在
2026-08-09 的 OTel 迁移（commit `d45c8b2`）中从 Prometheus exporter（`:9109/metrics`）
切换到 OpenObserve——`run-mock.sh` 起本地 OO 容器，`mock-verify.sh` 通过
`POST /api/default/_search?type=traces|logs` 查 OO 做 trace/log 断言。

但 `mock-verify.sh` 的 **candle 聚合/封存核心断言**（candidateCount / sealedTotal /
oldestLagMs / 帧新鲜度）在 `shrink-monitoring-to-blackbox-probe` 删除
`/internal/realtime/*` 诊断端点时被整块注释掉（L18-77），标注
`TODO(shrink-monitoring-to-blackbox-probe)`，至今未恢复。

后果：mock-env 能证明"帧到达 backend → 进了 candle pipeline"（trace 层），但
**证明不了"candle 真的被 sealed 了"**（状态层）。这恰好是 mock-env 存在的核心价值——
验证 snapshot → 聚合 → Redis 封存链路。

两个下游 change 被阻塞：
- `decouple-bridge-callback-and-correct-vwap-bounds` F1：mock 全链路 VWAP 回放验证
- `extract-backtest-runtime` 5.2.10：mock 侧 mist 补偿指标验证（目前 in-stack 绕过）

**额外发现（落地时实锤）**：mock backend 当前**起不来**——main.ts L30-35 无条件
`app.get(RuntimeConfigService / RealtimeSubscriptionLifecycleObservationStore)` 并注册
lifecycle gauge，但 `RealtimeSubscriptionModule`（提供这两个 provider）在 mock 模式下
被 AppModule 排除 → DI 解析崩溃 `Nest could not find RuntimeConfigService element`。
根因：master 的 lifecycle declarative 演进（RuntimeConfigService + subscription-lifecycle
metrics 注册）没有同步 mock 分支。

## 目标

1. **恢复 candle 封存断言**（mist-datasource `mock-verify.sh`）：用 OpenObserve 作为
   证据源替代被删的 `/internal/realtime/*` 端点，验证 sealed candle 存在且增长。
2. **OO metrics API 可行性探针先行**：在定路径前先验证 mock OO 容器的 metrics 查询
   能力（`?type=metrics` 查 `mist_candle_sealed_total`），通则走 metrics 路径，不通
   fallback 到 logs 路径。
3. **mock 模式适配：main.ts 观测注册内聚到模块（完美方案，用户拍板 2026-08-12）**：
   三个 registerXxx 从 main.ts 迁到各自模块的 `OnModuleInit`（candle + compensation →
   RealtimeIngressModule；lifecycle → RealtimeSubscriptionModule），main.ts 零 provider
   依赖。修掉 mock 崩溃的同时消除"main.ts 与模块结构耦合"架构债，mock 模式零特判。
4. **提交 `.env.mock` 未提交改动**：`OTEL_SERVICE_NAME=mist-backend`（service_name
   串名修复在 mock 侧的补丁，与 [[otel-preload-service-name-trap]] 一致）。
5. **文档化 mock 环境变量**（mist `.env.example`）：补 `MIST_MOCK_MODE` /
   `MIST_MOCK_CLOCK_OFFSET_MS` 说明。

## 非目标（明确不做）

- **不改后端观测契约**：gauge 名、语义、label 全部不变，只迁移注册调用点；不新增
  gauge/log/span。
- **不改 mock mode 行为**：`MIST_MOCK_MODE` 条件展开、allowlist 内存解析、clock offset
  逻辑全部保持不变；`isMockMode()` 仍只出现在 AppModule 和 RealtimeIngressModule 内部，
  main.ts 不再感知 mock。
- **不恢复任何 HTTP 诊断端点**：`/internal/realtime/*` 的删除保持锁定。
- **不扩大 mock-env 范围**：不加 VWAP 值校验、不加 backtest 服务——这些属于各自
  owning change 的 F1 / 5.2.10 任务，不在本 change 范围。
- **不动 HIL 脚本**（mist-deploy）：HIL 适配由 `retire-diagnostic-endpoints-to-structured-logs`
  负责，本 change 不碰。

## 决策记录（2026-08-12 用户拍板）

| # | 决策 | 理由 |
|---|---|---|
| D1 | OO metrics API 探针先行（方案 B） | mock-verify.sh 已有 `query_oo_traces`/`query_oo_logs`（`?type=traces\|logs`），但 `?type=metrics` 在 mock OO 容器里从未实测过；先跑探针再定路径避免返工 |
| D2 | 新建独立 change（方案 B），不并入 retire-diagnostic-endpoints | retire-diagnostic-endpoints 正在开工，不混入；mock-env 是 test tooling，scope 独立可单独 review |
| D3 | 保留两级断言结构 | 原 mock-verify.sh 设计分"始终可验证"（帧到达/candidates）和"时间门控"（sealed 增长，需 payable bucket）两级；恢复时保留这个结构 |
| D4 | 不新增后端 gauge/log | 现有 `mist_candle_sealed_total` + `candle.snapshot.process` span + `candle ingest start` 日志已覆盖全部断言需求 |
| D5 | 新鲜度检查删除 | 旧 `lastAcceptedAt` 语义在 mock 里测的是注入器（用户可控）而非管线；端到端实时证据由 sealed 增长承担（帧到达+聚合+封存全链），且 run-mock.sh 文档化的一次性注入在 30s 硬判下会误报 |
| D6 | main.ts 观测注册内聚到模块（完美方案） | mock backend 启动崩溃的根因是 main.ts 无条件 `app.get` 被 mock 排除的模块 provider；最小修复（`if (!isMockMode())`）会把 mock 特判散到 main.ts 且不解决架构耦合；观测注册跟随模块生命周期是结构正解——模块在则观测在，main.ts 零 provider 依赖，mock 模式零特判 |
