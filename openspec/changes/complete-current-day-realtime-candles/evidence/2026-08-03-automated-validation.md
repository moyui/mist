# 2026-08-03 自动化验证记录

## 范围

- `mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring`
- 分支：`feat/complete-current-day-realtime-candles`
- 本记录只证明自动化基线，不替代任务 5.4 的交易时段 HIL 或任务 5.5 的人工评审。

## 结果

### mist

- `pnpm run lint:check`：通过。
- `pnpm run typecheck`：通过。
- `env TZ=UTC pnpm run test:ci`：通过，103 个 test suites 通过、2 个跳过；860 个 tests
  通过、3 个跳过。沙箱内首次运行的两个既有 HTTP integration suites 因禁止监听临时端口而
  `EPERM`，在允许本机临时端口的相同源码环境中原样重跑后通过，不是产品失败。
- `pnpm run ci:contracts`：通过。worktree 不满足脚本默认的相邻仓库路径假设，使用临时只读
  symlink workspace 显式传入 `MIST_WORKSPACE_ROOT`，未修改仓库内容。
- `pnpm run build:docker`：通过，`mist`、`chan`、`realtime-subscription-hil` 均成功构建。
- `openspec validate --all --strict`：66 项通过、0 失败，其中包含
  `complete-current-day-realtime-candles` 与 `capture-realtime-provider-anomalies`。

### mist-datasource

- `uv run pytest`：480 个 tests 通过；仅有 1 条既有 Starlette deprecation warning。
- `uv run ruff check .`：通过。
- `uv run pyright`：0 errors、0 warnings、0 informations。
- 首次沙箱运行因默认 uv cache 不可读而失败；允许读取既有 uv cache 后按质量指南原命令重跑通过。
- OpenAPI/退役字段检查由全量测试中的 artifact 与 contract tests 覆盖。

### mist-deploy

- `.github/workflows/test-deploy-scripts.yml` 声明的全部 PowerShell contract tests 使用
  `pwsh-preview` 运行并通过。
- `docker compose --env-file docker/.env.example -f docker/compose.yaml config --quiet`：通过。
- `openspec validate --specs --strict`：4 项通过、0 失败。

### mist-monitoring

- `GOCACHE=/tmp/mist-monitoring-go-cache bash scripts/verify.sh`：通过。
- 其中 Python metrics contract tests 9 个通过、stable OpenSpec specs 4 项通过、全部 Go packages
  通过。

### 跨仓契约

- 四仓 `realtime-native-frame-v2.json` 字节级 SHA-256 一致：
  `687523d9cab44ed433ff89d623bd82b02a08a245522fdf469417878c4f2486bd`。
- 四仓 sidecar 内容一致并指向上述 JSON SHA。
- 四仓 `git diff --check` 通过，验证完成时工作区均干净。

## 未完成门禁

- 未运行 TDX/QMT 支持交易时段 shadow、restart/AOF、capacity、protected-table digest HIL。
- 未新增 snapshot collector；后续 HIL 直接复用 datasource/backend 现有实时输出，历史对照只调用
  datasource 既有只读接口。
- 未人为制造 provider 异常；未自然出现的异常继续记为 `not-observed`，真实 incident 由
  `capture-realtime-provider-anomalies` 承接。
- `REALTIME_PRODUCTIZATION_MODE` 仍必须保持 `off`，直到 5.4 与 5.5 均完成。
