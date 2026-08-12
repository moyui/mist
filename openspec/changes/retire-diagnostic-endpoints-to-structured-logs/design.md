# Design: retire-diagnostic-endpoints-to-structured-logs

## 1. WS transport 生命周期日志（mist 仓，TDX + QMT 对称）

### 1.1 事件点与级别（对齐现有纪律：info=生命周期 / warn=非预期 / error=真实失败）

改动文件：`apps/mist/src/sources/{tdx,qmt}/realtime/realtime.client.ts`

| 事件 | 触发点 | 级别 | 字段 |
|---|---|---|---|
| `connecting` | `connect()` 创建 WebSocket 前 | info | `event, connectionId, wsUrl` |
| `connected` | `ws.on('open')` | info | `event, connectionId` |
| `ready` | `handleReady()` 契约校验通过（transportReady=true） | info | `event, connectionId, source` |
| `ready_rejected` | `handleReady()` 契约校验失败 | warn | `event, connectionId, reason`（现有 recordReject 的 code） |
| `error` | `ws.on('error')` | error | `event, connectionId, errorMessage, lastMessageAt` |
| `disconnected` | `ws.on('close')` | warn（非预期）/ info（shuttingDown） | `event, connectionId, lastMessageAt, willReconnect` |
| `reconnecting` | close 后调度 `setTimeout` | info | `event, connectionId, reconnectDelayMs` |

级别要点：
- `error` 每次 WS error 回调都打 error（重连有 5s 延迟，频率有界）。
- `disconnected` 在 `shuttingDown` 时打 info（主动关闭），否则 warn（非预期断连，
  即将自动重连）。
- `ready_rejected` 使用现有 `recordReject` 的 reason code（`TDX_REALTIME_READY_CONTRACT_MISMATCH`）。

### 1.2 lastMessageAt 语义

- 内存字段 `lastMessageAt: string | null`（RFC3339），在 `ws.on('message')` 回调
  里更新——**不为此打日志**（无 per-message 日志）。
- 仅在生命周期事件日志里作为字段输出（error/disconnected），用于判断"连接
  活着但数据断了"还是"连接也断了"。

### 1.3 日志风格

- 模板字符串 `key=value`，与现有 `candle ingest start source=tdx symbol=...`
  一致（如 `tdx realtime ws event=error connectionId=5 errorMessage=...`）。
- 前缀：TDX `tdx realtime ws ...`，QMT `qmt realtime ws ...`（便于 grep）。
- 走现有 pino → instrumentation-pino → OTLP logs → OpenObserve 通道（gaps B1
  已建），零新基建；OO 日志按 `event` 字段检索。

### 1.4 不变量

- 不逐 message 打日志。
- 不新增 HTTP 端点、不新增 OTel span/gauge（D5：本次纯日志）。
- QMT client 与 TDX 完全对称（同一事件点/级别/字段）。

### 1.5 Snapshot ingest 日志扩 native 摘要字段（替代 evidence 端点）

backend WS client 每条 snapshot 已在打 `candle ingest start source=... symbol=...
capturedAt=...` 日志（逐 snapshot，频率特征不变）。为替代被删除的 datasource
evidence 端点（HIL 对账数据源），给这条**已有日志**补充 native 摘要字段：

- `nativeKeys`：decoded native map 的 key 列表，**sorted、长度封顶（前 20）**
- `asOf` / `volume` / `amount`：从 decoded native map 取（TDX 的 `AsOf`/`Volume`/
  `Amount`；QMT 对应原生字段）

字段来源：`handleSnapshot` 里 `decoded.data.native`（`decodeRealtimeNativeMapMessage`
透传的 native map）。

效果：HIL 对账从"datasource evidence 端点 vs backend canonical"改为"backend
日志的 native 摘要 vs backend canonical.native"，覆盖 decode/convert 层。传输
层（datasource→backend）由 schema-v2 strict decoder + `snapshot.process` span
独立保障，不再依赖 evidence。

为什么不在 datasource 加 evidence 日志：evidence 是"按需回读最近帧"，持续
日志（无论节流与否）要么高频爆炸、要么节流破坏"最近帧"时间精度——两头不
讨好。backend snapshot 日志本就逐条存在，补字段零频率成本。

## 2. 下掉 `GET /providers`（datasource TDX）

- 删除 `mist-datasource/tdx/routes/v1/product.py:220` 的 `/providers` 路由。
- `build_provider_manifests`（`src/datasource/capabilities.py:217`）仅此一处
  使用，连同 `product.py:9` import 一并删（落地时 grep 确认 `ProviderManifest`
  是否还有其他引用）。
- 测试同步：`tests/unit/test_tdx_route_boundaries.py:29`、
  `tests/integration/test_tdx_v1.py:596,610` 删除对应断言。
- OpenAPI 生成物同步（若有 golden artifact）。
- 无生产消费方（调查确认仅测试引用）。

## 3. 删除 `GET /tdx/bridge/evidence/{symbol}`（datasource TDX，纯删除）

datasource 侧改动（纯删除，**不加日志、不节流**）：

- 删路由 `tdx/routes/bridge.py:274-292`（+ `_gateway_error` 若仅此处使用）。
- 删 `gateway.read_native_evidence`（`src/datasource/tdx/realtime/gateway.py:529-544`）。
- 删 `_native_evidence` 字段（gateway.py:142）+ 4 处 clear（L243,300,315,330）
  + 写入点 L489-498。
- `copy` import 若仅 evidence 使用则一并删（落地时 grep 确认）。

HIL 对账迁移到 backend snapshot 日志（见 §1.5 + §4）。

## 4. mist-deploy 脚本 stale 引用清理

| 文件 | 位置 | 处理 |
|---|---|---|
| `scripts/capture-realtime-subscription-lifecycle-audit.ps1` | :8 默认参数 | 删除 `/internal/realtime/subscriptions/status` 默认值 |
| `scripts/run-realtime-dual-source-soak.ps1` | :121（早 return 死代码）+ :3,5 健康 URL | 删除死代码路径 |
| `scripts/run-realtime-candle-shadow-hil.ps1` | :193,545,914,1077 注释 + :987-999 evidence | 清理注释；**evidence 改读 backend 日志**（见下） |
| `scripts/test-realtime-candle-shadow-hil.ps1` | :195 注释 | 清理注释 |
| `scripts/run-realtime-mode-isolation-hil.ps1` | :4,62 MetricsUrl + :118 注释 | 删 MetricsUrl（monitoring 已不存在），注释清理 |
| `scripts/run-tdx-runtime-smoke.ps1` | :416 raw/call 调用 | **保留**（D1） |

**HIL evidence 改读 backend 日志**（`run-realtime-candle-shadow-hil.ps1:987-999`）：

原（datasource evidence 端点）：
```
$nativeEvidence = Invoke-JsonGet -Uri "$datasourceBaseUrl/tdx/bridge/evidence/$FormatCode"
```
改（backend snapshot 日志）：
```
$line = docker logs mist-backend --since 5m 2>&1 |
        Select-String "candle ingest start source=tdx symbol=$FormatCode " |
        Select-Object -Last 1
# 解析 $line 的 key=value 字段（nativeKeys/asOf/volume/amount）→ $evidence.tdxNativeEvidence
```
- 保持 `$evidence.tdxNativeEvidence` 结构不变（symbol/capturedAt/nativeKeys/
  asOf/volume/amount），下游断言不动。
- `--since 5m` 覆盖最近帧（snapshot 高频，5 分钟内必有该 symbol 行）。
- docker logs 无需 OO 凭据，本地执行（现有先例：closed-hash workflow grep backend 日志）。

原则：只清 stale 引用，不动运行时代码；不恢复任何已删端点。

### 4.1 mode-isolation HIL 适配（9109 metrics 退役）

`run-realtime-mode-isolation-hil.ps1` 与 `run-windows-realtime-mode-isolation-hil.yml`
曾 scrape `:9109/metrics`（monitoring exporter 已删，scrape 会炸）。实际
`Wait-RealtimeModeEvidence` 只靠 datasource `/health` 的 `realtimeMode` 字段
验证（metric 侧证据在 shrink 时已移除，`expectedMetric` 已为 `$null`）——
9109 scrape 是纯残留：

- 脚本：删 `MetricsUrl` 参数 + `Invoke-WebRequest` scrape + `expectedMetric`
  逻辑 + 7 处 `-MetricsUrl` 传参；`health.realtimeMode` 保持为验证证据。
- workflow：删 `metrics_url` 输入 + `MIST_METRICS_URL` env + 传参。
- mist 启动日志：`bootstrap()` 打 `realtime productization mode=<off|shadow|on>`
  （从 ConfigService 读，`?? 'off'`），作启动期证据与排障（mode-isolation
  的 datasource mode 验证已由 `/health.realtimeMode` 承担，不依赖此日志）。

## 5. 验证路径

- mist：`pnpm typecheck` / `pnpm lint:check` / `env TZ=UTC pnpm run test:ci` /
  `pnpm run test:coverage`（新日志行 + snapshot 字段需 spec 覆盖）。
- datasource：`uv run pytest` / `uv run ruff check .` / `uv run pyright`。
- mist-deploy：`pwsh-preview` 跑受影响脚本的 dry-run / CI gate。
- 日志验证：mock 栈或生产 OO 查 `event=connecting|connected|ready|error|disconnected`
  行 + `candle ingest start` 行含 nativeKeys/asOf/volume/amount。
- 端点下掉验证：`/providers`、`/tdx/bridge/evidence/*` 返回 404。

## 6. 跨仓影响面

| 仓库 | 改动 |
|---|---|
| mist | WS 生命周期日志（2 文件）+ snapshot 日志扩字段（2 文件）+ 2 新 spec + 1 MODIFIED spec |
| mist-datasource | 删 /providers + 删 evidence（路由/缓存/方法）+ 测试 + OpenAPI |
| mist-deploy | 脚本 stale 清理 + HIL 改读 backend 日志（无 compose/workflow 契约变化） |
| mist-monitoring | 本地仓已删（无改动） |

无数据库、无 wire contract、无 compose/env 变化 → 不需要 migration、不需要
原子发布；mist + datasource 各自发布。
