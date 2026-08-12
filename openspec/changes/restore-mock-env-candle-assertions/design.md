# Design: restore-mock-env-candle-assertions

日期：2026-08-12
状态：proposed（待确认）

## 1. 影响链

```
[producer]  backend candle-metrics.ts → 10 个 OTel observable gauge
                                （mist_candle_sealed_total, mist_candle_discard_total, …）
            backend structured logs → candle ingest start source=… symbol=…
            backend candle pipeline → candle.snapshot.process root span
    ↓ OTLP HTTP export（OTEL_EXPORTER_OTLP_ENDPOINT → mock OO 5080）
[wire]      OTLP/HTTP → OpenObserve container（per-metric stream / per-service log stream）
    ↓
[state]     OpenObserve streams（traces / logs / metrics 各按 type 分流）
    ↓
[consumer]  mock-verify.sh → POST /api/default/_search?type={traces|logs|metrics}
                                查 candle.snapshot.process span（已工作）
                                查 backend.log trace_id（已工作）
                                查 mist_candle_sealed_total（待恢复）  ← 本 change 核心改动
    ↓
[deploy]    run-mock.sh 编排本地 OO + redis + backend + datasource 进程
```

本 change 只动 **consumer**（mock-verify.sh）和 **配置文档**（.env.mock / .env.example）。
producer（后端 gauge/log/span）和 wire（OTLP 导出）不变。

## 2. 断言映射（旧端点 → 新 OO 证据源）

| 旧断言（注释中） | 旧数据源（已删） | 新证据源（OO） | 覆盖度 |
|---|---|---|---|
| candidates ≥ 1（帧持续到达） | `/internal/realtime/candles/status` → candidateCount | `candle.snapshot.process` span 存在（**已有断言 L174-179**） | ✅ 已覆盖 |
| sealed 增长 | 同上 → sealedTotal | `mist_candle_sealed_total` gauge 两点查询 | ⬅ **本 change 恢复** |
| due payable → sealed 增长 | 同上 → oldestLagMs > 0 | 简化：注入 payable bucket 后 sealed_total 增长即充分证据 | ⬅ **本 change 恢复（简化）** |

**新鲜度检查（旧 `lastAcceptedAt` 语义）已删除**（用户拍板 2026-08-12）：mock 环境注入时序
由用户控制，span 年龄测的是注入器而非管线；端到端实时证据由 Level 2 sealed 增长承担——增长
即"帧到达 + 聚合 + 封存"全链真实发生，比 span 新鲜度更强。run-mock.sh 文档化的一次性注入
（`--frames 5`）在 30s 硬判下会误报，也是删除的原因。

**关键简化**：旧 `oldestLagMs` 断言精确检查"due ZSET 里最老的 payable member 滞后多少 ms"。
mock 环境有 `MIST_MOCK_CLOCK_OFFSET_MS` 可控时序（clock 前移让 wall-clock-driven 逻辑自然推进），
因此不需要 oldestLagMs 这个精确值——只要注入帧到 payable bucket 后 sealed_total 增长，
就证明封存链路在工作。如果 sealed_total 不增长，才需要进一步诊断（但那是排障不是验证）。

## 3. D1：OO metrics API 探针设计

### 问题

`mock-verify.sh` 已有 `query_oo_traces()`（`?type=traces`）和 `query_oo_logs()`
（`?type=logs`）。`?type=metrics` 在 mock OO 容器（`public.ecr.aws/zinclabs/openobserve:latest`）
里**从未实测过**。生产环境确认 OO 收到 metrics（[[remediate-g2-deployed]]：OO metrics 流名=per-metric），
但 mock 用的 OO 容器版本和配置可能与生产不同。

### 探针方案（实施计划阶段执行）

在 mock-env 运行状态下（`run-mock.sh` + `mock-drive.py` 注入帧 + 等待封存），执行：

```bash
# 探针：查 mist_candle_sealed_total 是否可通过 ?type=metrics 查到
curl -s -X POST "http://127.0.0.1:5080/api/default/_search?type=metrics" \
  -H "Authorization: Basic $OO_B64" \
  -H "Content-Type: application/json" \
  -d '{"query":{"sql":"select * from '\''mist_candle_sealed_total'\'' order by _timestamp desc limit 5"},"size":5}'
```

### 路径分支

| 探针结果 | 路径 | 实现方式 |
|---|---|---|
| ✅ 返回 gauge 数据 | **metrics 路径**（首选） | 新增 `query_oo_metrics()` 函数，查 `mist_candle_sealed_total` 两点比较 |
| ❌ 空结果/报错/不支持 | **logs 路径**（fallback） | 用已有 `query_oo_logs()` 查 backend 结构化日志中 sealed 相关条目（需确认后端是否在封存时打日志——若有则直接查，若无则在 design 阶段重新评估是否需要后端补一条 info 日志，但这会触发 scope 扩大讨论） |

**注意**：如果 fallback 到 logs 路径且后端当前没有 sealed 成功的结构化日志，这是一个
**scope 扩大信号**——需要停下来与用户讨论是否给后端补一条封存日志（这将改变 D4 决策）。
探针的目的就是提前暴露这个风险。

## 4. 两级断言结构（D3）

恢复后的 mock-verify.sh 保留原有两级设计：

### Level 1：始终可验证（24/7）

mock-drive.py 重写 eventTime 到目标交易时段，因此帧注入和聚合不依赖真实交易时间。

- **帧持续到达**：`tdx.snapshot.ingest` / `ws.broadcast` / `candle.snapshot.process`
  span 存在（已有断言 #1-#3，本 change 不动）
- **sealed 存在**：`mist_candle_sealed_total` 有值（informative，无值不判 FAIL）

### Level 2：时间门控（需 payable bucket）

mock 环境用 `MIST_MOCK_CLOCK_OFFSET_MS` 前移时钟，使 wall-clock-driven 的 due admission /
finalization 自然推进。当 clock 前移足够远时，注入的帧所属 bucket 变为 payable。

- **sealed 增长**：sleep 10s 后 `mist_candle_sealed_total` 增大
- 若 sealed 不增长（clock offset 不足 / bucket 未 payable），打印 deferred 提示，
  不判定 FAIL——与原设计一致

## 5. mock-verify.sh 改动结构

```
# 删除 L18-48 注释块（candle_snapshot + latest_frame_age 函数）
# 删除 L54-77 注释块（主断言逻辑）

# 新增（metrics 路径）或复用（logs 路径）：
query_oo_metrics() { ... }          # D1 探针通过时新增

# 新增断言块（替换 L54-77）：
# --- Level 1: 始终可验证 ---
echo "==> candle sealing evidence"
SEALED_1=$(query_sealed)             # metrics 或 logs 路径
[ "$SEALED_1" -ge 1 ] || deferred   # Level 1 不强判 FAIL

# --- Level 2: 时间门控 ---
sleep 10
SEALED_2=$(query_sealed)
if [ "$SEALED_2" -gt "$SEALED_1" ]; then
  echo "  sealed $SEALED_1 -> $SEALED_2 ✅"
else
  echo "  sealed not growing (clock offset or bucket not payable); deferred"
fi
```

## 6. main.ts 观测注册内聚（D6，完美方案）

### 问题

main.ts L23-35 无条件解析并注册三组 OTel 观测：

```
registerCandleMetrics(CandleFinalizer, RealtimeMarketDataProductService)      // RealtimeIngressModule
registerStartupCompensationMetrics(RealtimeStrategyStartupCompensationService) // RealtimeIngressModule
registerSubscriptionLifecycleMetrics(ObservationStore, Allowlist, autoReconcile) // RealtimeSubscriptionModule
```

`RealtimeSubscriptionModule` 在 mock 模式被 AppModule 排除（app.module.ts L118-120），
但 main.ts 依然 `app.get(RuntimeConfigService)` → mock backend 启动崩溃
`Nest could not find RuntimeConfigService element`。

### 方案

观测注册跟随模块生命周期：三个 registerXxx 迁到各自模块的 `OnModuleInit`，
main.ts 删除全部 `app.get` + `registerXxx`，不再 import 任何业务/观测 provider。

| 注册组 | 迁移目标模块 | 依赖可解性 |
|---|---|---|
| candle（`registerCandleMetrics`） | RealtimeIngressModule | finalizer/product 均为本模块 provider ✅ |
| compensation（`registerStartupCompensationMetrics`） | RealtimeIngressModule | compensation 为本模块 provider ✅ |
| lifecycle（`registerSubscriptionLifecycleMetrics`） | RealtimeSubscriptionModule | store/runtimeConfig 本模块；allowlist 经 @Global Ingress 注入 ✅ |

### 时序与幂等

- OTel SDK 由 preload（`node -r @opentelemetry/auto-instrumentations-node/register`）
  在进程最早 init；模块 `OnModuleInit` 在其后执行 → meter 已就绪。
- 各 registerXxx 的 `_registered` 幂等 flag 保留；测试环境的 noop meter 安全。

### 收益

1. mock 崩溃修复且 **mock 模式零特判**——`isMockMode()` 只出现在 AppModule 和
   RealtimeIngressModule 内部，main.ts 不感知 mock。
2. **main.ts 与模块结构解耦**——未来加/减/排除模块，main.ts 零改动；"模块排除 →
   main.ts 崩"类缺陷从机制上消失。
3. 观测归属其数据源模块 = 单一事实源；顺带收口审计 F4 记录的 main.ts 死参数问题。

### 风险

| 风险 | 应对 |
|---|---|
| 模块 onModuleInit 在测试实例化时执行 | noop meter 不崩；跑 app.module.spec + mock.spec 全量确认 |
| gauge 注册时序（SDK init 前后） | preload 保证 SDK 最先 init；若发现竞态，在模块内延迟到 listen 前注册 |
| coverage 基线 82.72 | 改动行少（删除 > 新增），跑 test:coverage 确认 |

## 7. 配置改动

### .env.mock（mist-datasource，提交未提交改动）

```
OTEL_SERVICE_NAME=mist-backend
```

这行已存在于工作区但未提交。它修复 [[otel-preload-service-name-trap]]：
preload 忽略 `initTelemetry` serviceName，用 `OTEL_SERVICE_NAME ?? 'mist-backend'`。
mock-env 的 backend 是 `pnpm start`（非 compose），不会自动设 `OTEL_SERVICE_NAME`，
所以需要在 `.env.mock` 显式设。提交这行让 mock-env 的 backend 日志/spans 不串名。

### .env.example（mist，补文档）

在适当位置追加：

```bash
# Mock realtime mode (local verification only, never production)
# MIST_MOCK_MODE=true               # skip MySQL + business modules, load realtime chain only
# MIST_MOCK_CLOCK_OFFSET_MS=        # positive int: shift Clock forward (ms) for due/finalization
```

## 8. 验证路径

1. **OO metrics 探针**（实施计划阶段）：确认 metrics 查询可行或确定 fallback
2. **mock-env 端到端**：`run-mock.sh` → `mock-drive.py --source tdx` → `mock-verify.sh` 全绿
3. **openspec validate --strict**：本 change 通过
4. **退役路径检索**：mock-verify.sh 中无活跃的 `/internal/realtime/*` 引用
5. **下游 unblock 验证**：decouple-bridge F1 / extract-backtest 5.2.10 可以基于恢复的断言推进
