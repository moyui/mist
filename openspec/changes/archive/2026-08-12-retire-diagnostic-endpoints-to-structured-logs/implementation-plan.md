# 实施计划 — retire-diagnostic-endpoints-to-structured-logs

> 2026-08-12。spec 已确认（proposal D1-D6 / design / tasks / 3 个 specs delta）。
> evidence 方案修订（D2）：datasource 纯删除，对账字段并入 backend snapshot 日志。
> 落地前置：本计划经用户确认后开工。

## 0. 前置事实（已逐行核实）

- `TdxRealtimeClient`/`QmtRealtimeClient` 的 `connect()`（各自 L201-236）5 个 WS
  回调全部零日志；`logger` 仅 snapshot 路径 2 处（reject warn / ingest log）；
  `handleReady` 静默。两 client 结构逐行对称。
- 两 client **无现有单测**（目录下只有 native-snapshot.converter.spec.ts）；
  ws mock 先例：`realtime/hil/realtime-subscription-hil.guard.spec.ts`。
- 现有 `candle ingest start` 日志（TDX L363 / QMT L357）已逐 snapshot 打，
  在 `handleSnapshot` 的 `convertTdxNativeSnapshot` 成功后；`decoded.data.native`
  在该作用域可用（L334 解构）。
- TDX datasource：
  - `/providers`：`tdx/routes/v1/product.py:220`，调 `build_provider_manifests`
    （`src/datasource/capabilities.py:217`，仅此一处使用）。
  - evidence：路由 `tdx/routes/bridge.py:274-292` → `gateway.read_native_evidence`
    （`gateway.py:529-544`）读内存 `_native_evidence`（L142 定义 /
    L243,300,315,330 clear / L489-498 每帧写入 / L537 读取）。
- HIL 对账字段（`run-realtime-candle-shadow-hil.ps1:987-999`）：symbol、
  capturedAt、nativeKeys、asOf、volume、amount。
- datasource Python 日志已进 OO（O2b 归档 64f8ea7），但 HIL 在 Windows 本地跑，
  推荐 `docker logs mist-backend` grep（现有先例，无需 OO 凭据）。
- jest 覆盖率门槛（lines 82.72 / statements 81.64 / functions 78.47 /
  branches 67.9）。
- 分支纪律：mist/datasource 改动走 feat 分支 worktree；mist-deploy 脚本清理
  可直接 master。

## 1. 分支与工作流

- mist：`feat/retire-diagnostic-endpoints` worktree（基于 master）
- datasource：同分支名 worktree（独立 git 仓）
- mist-deploy：直接 master 小提交（脚本清理 + HIL 改读日志，无契约变化）
- 提交序列：① spec 四件套 → ② mist 侧（WS 日志 + snapshot 字段）→
  ③ datasource 侧（删 /providers + 删 evidence）→ ④ deploy 侧 → ⑤ tasks 勾选

## 2. mist 侧改动

### 2.1 WS 生命周期日志 — `apps/mist/src/sources/{tdx,qmt}/realtime/realtime.client.ts`

**新增字段**（类属性，connect 区域附近）：
```ts
private lastMessageAt: string | null = null;
```

**message 回调**（`ws.on('message')` 内，handleMessage 调用前一行）：
```ts
this.lastMessageAt = new Date().toISOString();
```

**connect() 各回调日志**（前缀 tdx/qmt，风格与现有 `candle ingest start` 一致）：

| 位置 | 日志 |
|---|---|
| `connect()` 创建 WS 前 | `this.logger.log(\`tdx realtime ws event=connecting connectionId=${connectionId} wsUrl=${this.wsUrl}\`)` |
| `open` 回调 | `this.logger.log(\`tdx realtime ws event=connected connectionId=${connectionId}\`)` |
| `error` 回调（setError 旁） | `this.logger.error(\`tdx realtime ws event=error connectionId=${connectionId} errorMessage=${error.message} lastMessageAt=${this.lastMessageAt ?? '-'}\`)` |
| `close` 回调（markDisconnected 旁） | shuttingDown → `this.logger.log(\`... event=disconnected ... willReconnect=false\`)`；否则 `this.logger.warn(\`... event=disconnected ... willReconnect=true\`)`；字段 `connectionId=${connectionId} lastMessageAt=${this.lastMessageAt ?? '-'}` |
| `close` 内 setTimeout 前 | `this.logger.log(\`tdx realtime ws event=reconnecting connectionId=${connectionId} reconnectDelayMs=${this.reconnectDelayMs}\`)` |

**handleReady()**：
- 契约校验失败分支（recordReject 前）：
  `this.logger.warn(\`tdx realtime ws event=ready_rejected connectionId=${this.connectionId} reason=TDX_REALTIME_READY_CONTRACT_MISMATCH\`)`（QMT 用 QMT_ 前缀）
- 成功路径（transportReady = true 后）：
  `this.logger.log(\`tdx realtime ws event=ready connectionId=${this.connectionId}\`)`

**不变量**：不逐消息打日志；`lastMessageAt` 只出现在事件日志字段。

### 2.2 Snapshot 日志扩字段 — 同两文件 `handleSnapshot`

现有 L363（TDX）/ L357（QMT）：
```ts
this.logger.log(
  `candle ingest start source=tdx symbol=${providerSymbol} capturedAt=${decoded.data.capturedAt}`,
);
```
扩字段（`decoded.data.native` 在 L334 已解构为 `value`，作用域可用）：
```ts
const nativeKeys = isRecord(value)
  ? Object.keys(value).sort().slice(0, 20).join(',')
  : '-';
this.logger.log(
  `candle ingest start source=tdx symbol=${providerSymbol} capturedAt=${decoded.data.capturedAt} nativeKeys=${nativeKeys} asOf=${value?.['AsOf'] ?? '-'} volume=${value?.['Volume'] ?? '-'} amount=${value?.['Amount'] ?? '-'}`,
);
```
QMT 用其原生字段名（落地时核实 QMT native map 的 asOf/volume/amount key）。

### 2.3 新测试 `apps/mist/src/sources/{tdx,qmt}/realtime/realtime.client.spec.ts`

mock：`jest.mock('ws')` 注入 MockWebSocket，`jest.spyOn(Logger.prototype,
'log'|'warn'|'error')`。
```ts
class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  on(ev: string, cb: (...a: any[]) => void) { (this.handlers[ev] ??= []).push(cb); }
  emit(ev: string, ...args: any[]) { this.handlers[ev]?.forEach((h) => h(...args)); }
  send() { /* noop */ }
  close() { /* noop */ }
}
```

用例（TDX；QMT 对称一份）：
1. **连接建立**：connect → emit('open') → emit('message', 合法 ready frame) →
   断言 log 序列含 `event=connecting/connected/ready`，connectionId 一致、
   connecting 带 wsUrl。
2. **error**：emit('error', {message:'boom'}) → error 级 + `event=error` +
   `errorMessage=boom` + `lastMessageAt`（先 emit message 再 error）。
3. **close 重连**：emit('close') → warn `event=disconnected` +
   `willReconnect=true` + `event=reconnecting`。
4. **shuttingDown close**：onModuleDestroy → disconnected 为 info 级。
5. **ready 契约失败**：emit('message', 非法 ready frame) → warn
   `event=ready_rejected` + reason。
6. **snapshot 日志扩字段**：emit('message', 合法 native_snapshot frame) →
   断言 `candle ingest start` 含 `nativeKeys`/`asOf`/`volume`/`amount`。

覆盖：新日志行 100% 覆盖（含 disconnected 两级别分支）。

## 3. datasource 侧改动

### 3.1 `src/datasource/tdx/realtime/gateway.py`（纯删除 evidence）
- 删 `_native_evidence` 字段（L142）+ 4 处 clear（L243,300,315,330）+ 写入点
  L489-498（`self._native_evidence[symbol] = {...}` 整块）。
- 删 `read_native_evidence` 方法（L529-544）。
- `copy` import：grep 确认 gateway 内是否仅 evidence 使用；若是则删。
- **不加 logger、不加 evidence 日志、不节流。**

### 3.2 `tdx/routes/bridge.py`
- 删 `GET /tdx/bridge/evidence/{symbol}` 路由（L274-292）。
- `_gateway_error` 若仅此处使用则删（grep 确认）。

### 3.3 `tdx/routes/v1/product.py` + `src/datasource/capabilities.py`
- 删 `/providers` 路由（L220-226）+ product.py:9 import。
- `build_provider_manifests`（capabilities.py:217）：grep `ProviderManifest`
  其他引用；若仅 /providers 使用则连 `ProviderManifest` 一起删。

### 3.4 测试同步
| 文件 | 处理 |
|---|---|
| `tests/unit/test_tdx_route_boundaries.py:29` | 删 /providers 断言 |
| `tests/integration/test_tdx_v1.py:596,610` | 删 /providers 相关 |
| `tests/unit/test_tdx_openapi_artifacts.py:49` | 删 evidence 路由 OpenAPI 断言（OpenAPI 重新生成） |
| `tests/unit/test_tdx_realtime_gateway.py:505+` | 删 read_native_evidence 测试 |
| gateway 测试引用 `_native_evidence` | grep 后清理 |

## 4. mist-deploy 侧（脚本清理 + HIL 改读 backend 日志）

| 文件:行 | 改动 |
|---|---|
| `scripts/capture-realtime-subscription-lifecycle-audit.ps1:8` | 删 `/internal/realtime/subscriptions/status` 默认参数 |
| `scripts/run-realtime-dual-source-soak.ps1:121` + :3,5 | 删死代码路径 |
| `scripts/run-realtime-candle-shadow-hil.ps1:193,545,914,1077` | 删 `/internal/*` 注释 |
| `scripts/test-realtime-candle-shadow-hil.ps1:195` | 删注释 |
| `scripts/run-realtime-mode-isolation-hil.ps1:4,62,118` | 删 MetricsUrl:9109 + 注释 |

**HIL evidence 改读 backend 日志**（`run-realtime-candle-shadow-hil.ps1:987-999`）：
```
原：$nativeEvidence = Invoke-JsonGet -Uri "$datasourceBaseUrl/tdx/bridge/evidence/$FormatCode"
改：$line = docker logs mist-backend --since 5m 2>&1 |
           Select-String "candle ingest start source=tdx symbol=$FormatCode " |
           Select-Object -Last 1
    解析 $line 的 key=value（nativeKeys/asOf/volume/amount）→ $evidence.tdxNativeEvidence
```
保持 `$evidence.tdxNativeEvidence` 结构（symbol/capturedAt/nativeKeys/asOf/
volume/amount）不变，下游断言不动。

## 5. 验证命令

### mist（worktree 内）
```bash
pnpm typecheck
pnpm lint:check
pnpm exec jest sources/tdx/realtime/realtime.client --runInBand
pnpm exec jest sources/qmt/realtime/realtime.client --runInBand
env TZ=UTC pnpm run test:ci          # 全仓（内置 --forceExit）
pnpm run test:coverage               # 门槛 82.72 lines
openspec validate --all --strict && openspec validate --changes
git diff --check
```

### datasource
```bash
uv run pytest tests/unit/test_tdx_route_boundaries.py tests/unit/test_tdx_realtime_gateway.py tests/unit/test_tdx_openapi_artifacts.py tests/integration/test_tdx_v1.py
uv run pytest           # 全量
uv run ruff check .
uv run pyright
# OpenAPI 重新生成 + artifacts diff 检查
```

### mist-deploy
```bash
pwsh-preview -Command "& './scripts/test-workflow-config.ps1'"
grep -rn "internal/realtime" scripts/ | grep -v archive   # 期望为零
```

## 6. 收尾顺序（确认后逐步执行）

1. 合并 + push（mist / datasource / deploy 三仓）
2. 部署（mist tag + datasource tag；productization=shadow 保持；lifecycle
   补设 on 按 422 惯例）
3. 生产验证：OO 查 `event=connecting|connected|ready|error|disconnected`
   日志行 + `candle ingest start` 行含 nativeKeys/asOf/volume/amount；
   `/providers`、`/tdx/bridge/evidence/*` 404
4. tasks 勾选 + 归档（--skip-specs）

## 7. 风险与注意

- **HIL evidence 改读 backend 日志**是唯一行为变化较大的点：字段解析用现有
  `$evidence.tdxNativeEvidence` 结构保持下游断言不变；snapshot 高频 →
  `--since 5m` 内必有该 symbol 行。
- `copy`/`ProviderManifest`/`GatewayError`/`_gateway_error` import 是否连带
  删除：落地时 grep 全仓确认，不臆断。
- datasource OpenAPI artifacts 是 golden：删路由必须重新生成，不能手改。
- 覆盖门槛：mist 新日志行全部有 spec 断言（6 用例覆盖分支）。
- 不恢复任何已删端点（shrink 锁定测试不动）；`/internal/realtime` 全工作区
  检索归零。
- 部署不传 lifecycle 输入（422 坑）→ 部署后 Set Windows Subscription
  Lifecycle 补设 on。
