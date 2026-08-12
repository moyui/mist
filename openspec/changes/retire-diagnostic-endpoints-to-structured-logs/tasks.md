# Tasks: retire-diagnostic-endpoints-to-structured-logs

> 状态约定：三步工作流——spec 确认 → 实施计划（代码级）→ 落地，每步断开。
> 决策记录见 proposal.md §决策记录（D1-D6）。

## 1. WS transport 生命周期日志（mist 仓）

- [ ] 1.1 `apps/mist/src/sources/tdx/realtime/realtime.client.ts`：connect/open/
      close/error/ready 事件打结构化日志（design §1.1 字段表），加
      `lastMessageAt` 内存字段（message 回调更新，不逐消息打日志）。
- [ ] 1.2 `apps/mist/src/sources/qmt/realtime/realtime.client.ts`：对称改动。
- [ ] 1.3 单测：连接生命周期日志断言（open→connected / error→error 级 /
      close→disconnected warn + shuttingDown 时 info / ready→ready 级）；
      注意 jest 覆盖率门槛（82.72 lines）。
- [ ] 1.4 验证：mock 栈或生产 OO 查 `event=connecting|connected|ready|error|
      disconnected` 行存在、字段齐全（对照 design §1.1）。

## 2. Snapshot ingest 日志扩 native 摘要字段（mist 仓）

- [ ] 2.1 `{tdx,qmt}/realtime/realtime.client.ts` 的 `handleSnapshot`：现有
      `candle ingest start` 日志补 `nativeKeys`（sorted，封顶 20）、`asOf`、
      `volume`、`amount`（从 `decoded.data.native` 取；QMT 用其原生字段名）。
- [ ] 2.2 单测：snapshot ingest 日志断言含 4 个 native 摘要字段（可在 1.3 的
      client spec 里并入，或 converter spec 扩展）。

## 3. 下掉 `GET /providers`（datasource TDX）

- [ ] 3.1 删 `tdx/routes/v1/product.py:220` `/providers` 路由 + import。
- [ ] 3.2 删 `build_provider_manifests`（capabilities.py:217）若仅此使用（grep
      确认 `ProviderManifest` 其他引用）。
- [ ] 3.3 删测试断言：`test_tdx_route_boundaries.py:29`、`test_tdx_v1.py:596,610`。
- [ ] 3.4 OpenAPI/golden artifact 同步。

## 4. 删除 `GET /tdx/bridge/evidence/{symbol}`（datasource TDX，纯删除）

- [ ] 4.1 删路由 `tdx/routes/bridge.py:274-292` + `_gateway_error`（若仅此使用）。
- [ ] 4.2 删 `gateway.read_native_evidence`（gateway.py:529-544）。
- [ ] 4.3 删 `_native_evidence` 字段 + 4 处 clear + 写入点 L489-498 + `copy`
      import（若仅 evidence 使用）。
- [ ] 4.4 删测试断言：`test_tdx_openapi_artifacts.py:49`、
      `test_tdx_realtime_gateway.py:505+`；grep `_native_evidence` 全清。

## 5. mist-deploy 脚本清理 + HIL 改读 backend 日志

- [ ] 5.1 `capture-realtime-subscription-lifecycle-audit.ps1:8` 删默认参数。
- [ ] 5.2 `run-realtime-dual-source-soak.ps1:121` 删死代码路径。
- [ ] 5.3 清理 3 个 HIL 脚本中 `/internal/realtime/*` 注释。
- [ ] 5.4 `run-realtime-mode-isolation-hil.ps1` 删 MetricsUrl:9109。
- [ ] 5.5 `run-realtime-candle-shadow-hil.ps1:987-999` evidence 改读 backend
      snapshot 日志（docker logs grep + 解析，保持 `$evidence.tdxNativeEvidence`
      结构不变）。
- [ ] 5.6 验证：受影响脚本 dry-run / CI gate（test-*.ps1）PASS；
      `/internal/realtime` 全工作区检索为零（归档证据除外）。

## 6. 收尾

- [ ] 6.1 全量验证基线（mist typecheck/lint/test:ci/test:coverage；
      datasource pytest/ruff/pyright；deploy gate）。
- [ ] 6.2 部署（mist + datasource tag），生产 OO 验证 WS 生命周期日志行 +
      snapshot 日志 native 字段。
- [ ] 6.3 勾 tasks + 归档（--skip-specs；rename-only）。

## 7. 提交（三步工作流）

- [ ] 7.1 spec 确认通过后写实施计划（代码级：文件/函数签名/测试用例/验证命令）。
- [ ] 7.2 实施计划确认后落地。
- [ ] 7.3 归档。
