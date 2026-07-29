# 2026-07-22 本地验证

## 变更边界

- 已删除 `mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring` 的顶层 `contracts/`。
- realtime golden fixture 已迁入各仓测试 fixture 目录。
- monitoring 的 `metrics.md`、`alerts.md`、`actions.md` 已迁入 `docs/`。
- 没有修改 realtime WS frame、transport、sequence/fencing、source mode、数据库或生产配置。
- archive 中的历史文件和路径引用未修改。

## Fixture 一致性

四份 `realtime-native-frame-v1.json` 的字节完全一致，SHA-256 均为：

```text
5d070445835b159222e4df70beae133650457c9a21e6cfe3d9b971863490472a
```

该值与迁移前 fixture SHA 相同。四份 `.sha256` sidecar 内容也完全一致。

验证方式：

```bash
shasum -a 256 <four-fixture-paths>
cmp <canonical-fixture> <consumer-fixture>
find mist mist-datasource mist-deploy mist-monitoring -maxdepth 1 -type d -name contracts
```

结果：fixture SHA 一致、`cmp` 全部通过、顶层 `contracts/` 查询为空。

## 测试结果

### mist

- `pnpm run lint:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run test:ci`：63 suites、355 tests 全部通过。
- `pnpm run ci:contracts`：通过。
- `pnpm run build:docker`：`mist` 与 `chan` webpack build 均通过。
- `pnpm exec jest apps/mist/src/realtime/realtime-ingress.contract.spec.ts --runInBand --watchman=false`：3 tests 通过。

本机 Node.js 为 v22.12.0，仓库声明 Node.js >=24，因此 pnpm 输出 engine warning；命令本身全部通过。

### mist-datasource

- `.venv/bin/ruff check .`：通过。
- `.venv/bin/pyright --pythonpath .venv/bin/python`：0 errors、0 warnings。
- `.venv/bin/pytest -m "not live" -q`：340 tests 通过，1 条既有 Starlette deprecation warning。
- fixture targeted test：1 test 通过。

`uv run --frozen` 在受限网络环境尝试解析本地 package build requirement `hatchling` 时被 PyPI DNS 限制阻断；因此使用同一 `.venv` 直接执行已安装的 Ruff、Pyright 与 pytest。该限制不涉及产品代码或测试结果。

### mist-deploy

- `scripts/test-realtime-contracts.ps1`：通过。
- `scripts/test-docker-compose-config.ps1`：通过。
- `.github/workflows/test-deploy-scripts.yml` 所列 14 个 PowerShell script tests：全部通过。

本机按工作区约定使用 `pwsh-preview -NoProfile`。

### mist-monitoring

- `python3 -m unittest tests.test_metrics_contract tests.test_package_structure`：10 tests 通过。
- `MIST_MONITORING_REQUIRE_GO=1 sh scripts/verify.sh`：Python tests、runtime metric validation、Go format/vet/tests 和 4 项 strict specs 全部通过。

Windows exporter integration test 需要 `httptest` 绑定 loopback 临时端口，因此完整 verify 在获准的非 sandbox 本地执行；未访问生产服务。

### OpenSpec

- `mist`: `openspec validate --all --strict`，50 items 通过。
- `mist-deploy`: `openspec validate --all --strict`，5 items 通过。
- `mist-monitoring`: `openspec validate --all --strict`，4 items 通过。
- focused change: `openspec validate relocate-cross-repo-contract-assets --strict` 通过。

## Windows HIL 判定

本次不需要重新执行 TDX/QMT Windows HIL，依据如下：

1. fixture 字节和迁移前 SHA 完全不变；仅文件路径与 SHA metadata 载体变化。
2. datasource frame、backend decoder、sequence/fencing 和 source mode 均未修改。
3. deploy runtime scripts 与生产配置未修改；相关完整 PowerShell regression 已通过。
4. targeted contract tests 和四仓完整受影响回归均通过。

如果后续修改 fixture 内容或 realtime transport contract，仍需按受影响范围重新执行 Theme A HIL。
