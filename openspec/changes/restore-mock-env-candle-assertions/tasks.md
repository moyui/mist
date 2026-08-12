# Tasks: restore-mock-env-candle-assertions

日期：2026-08-12
状态：proposed（待确认）

## 1. main.ts 观测注册内聚（D6，mock 模式适配前置）

- [x] 1.1 `RealtimeIngressModule` 实现 `OnModuleInit`：注册 candle + compensation 两组 gauge
- [x] 1.2 `RealtimeSubscriptionModule` 实现 `OnModuleInit`：构造注入 `RealtimeSecurityAllowlistService`，注册 lifecycle gauge
- [x] 1.3 main.ts 删除全部 `app.get` + `registerXxx` 及相关 import
- [x] 1.4 验证：mock 模式 backend 启动成功（`/app/hello` 200），生产模式 gauge 仍注册（日志/类型）

## 2. OO metrics API 探针（定路径）

- [x] 2.1 在 mock-env 运行状态下执行 `?type=metrics` 探针，查 `mist_candle_sealed_total`
- [x] 2.2 记录探针结果：metrics API 可行 → 走 metrics 路径；不可行 → 走 logs fallback
- [ ] 2.3 若 fallback 到 logs 路径：确认后端是否有封存成功的结构化日志；若无，停下来与用户讨论是否扩大 scope（D4 决策变更）

## 3. 恢复 candle 断言（mist-datasource mock-verify.sh）

- [x] 3.1 删除 L18-48 注释块（`candle_snapshot()` + `latest_frame_age()` 函数）
- [x] 3.2 删除 L54-77 注释块（旧主断言逻辑）
- [x] 3.3 新增 `query_oo_metrics()` 函数（若 D1=metrics）或复用 `query_oo_logs()`（若 D1=logs）
- [x] 3.4 新增 Level 1 断言：sealed 存在（`mist_candle_sealed_total` 有值，informative 不判 FAIL）
- [x] 3.5 新增 Level 2 断言：sealed 增长（sleep 后比较两点，不增长则 deferred 不判 FAIL）——端到端实时证据，替代已删除的新鲜度检查
- [x] 3.6 确保无活跃 `/internal/realtime/*` 引用（注释中的历史说明可保留）

## 4. 配置改动

- [x] 4.1 提交 mist-datasource `.env.mock` 未提交的 `OTEL_SERVICE_NAME=mist-backend`
- [x] 4.2 mist `.env.example` 追加 `MIST_MOCK_MODE` / `MIST_MOCK_CLOCK_OFFSET_MS` 文档说明

## 5. 验证

- [x] 5.1 mist 全量：lint + typecheck + test:ci + coverage（基线 82.72）
- [x] 5.2 mock-env 端到端：`run-mock.sh` → `mock-drive.py` → `mock-verify.sh` 全绿
- [x] 5.3 `openspec validate restore-mock-env-candle-assertions --strict` 通过
- [x] 5.4 退役路径检索：mock-verify.sh 无活跃 `/internal/realtime/*` 引用
- [x] 5.5 mist-datasource 基线：`uv run ruff check .` + `uv run pyright`（mock-verify.sh 是 bash，不跑 pytest/ruff，但确认无副作用）

## 6. 归档后（下游 unblock）

- [ ] 6.1 `decouple-bridge-callback-and-correct-vwap-bounds` F1 可基于恢复的断言推进 mock 全链路 VWAP 回放
- [ ] 6.2 `extract-backtest-runtime` 5.2.10 可在 mock-env 中验证 mist 补偿指标（替代当前 in-stack 绕过）
