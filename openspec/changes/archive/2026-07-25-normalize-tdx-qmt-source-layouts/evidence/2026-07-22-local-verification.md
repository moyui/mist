# 2026-07-22 本地验证

## 范围

- 分支：`feat/theme-b-realtime-productization`
- 修改仓库：`mist`、`mist-datasource`；`mist-deploy` 只同步 QMT bridge 的禁止自动复制守卫。
- 未修改 migration、数据库、realtime frame、HTTP/WS path、mode 默认值、allowlist 或生产环境。
- 未执行 Windows HIL、生产发布或终端 bridge 覆盖。

## Backend

以下命令通过：

```bash
npm run lint:check
npm run typecheck
npm run build:docker
npm run test:ci
npm run ci:contracts
```

结果：63 个 Jest suites、355 个 tests 通过；Mist 与 Chan Nest build 通过。新增布局守卫确认 TDX/QMT 共有职责使用 provider-local 通用文件名，source-specific adapter 测试确认 native object 保留且 canonical `eventTime` 由 backend source 边界生成。

## Datasource

以下命令通过：

```bash
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/pyright --pythonpath .venv/bin/python
.venv/bin/python scripts/export_openapi.py --all
```

结果：340 个 pytest tests 通过；Ruff 与 Pyright 为 0 errors。QMT production bridge 与 runtime probe 的 Python 3.6 guardrails 通过；TDX/QMT route、provider、runtime/contract 与 factory tests 通过；当前 OpenAPI artifacts 已重新生成。

`mist-datasource` 是 host-side WinSW 服务且仓库没有 Dockerfile，因此没有 datasource Docker image 可构建。

## Deploy guard

以下命令通过：

```powershell
pwsh-preview -NoProfile -File scripts/test-workflow-config.ps1
pwsh-preview -NoProfile -File scripts/test-qmt-runtime-recovery.ps1
```

守卫确认 recovery/deploy workflow 不会自动复制新命名的 `mist_qmt_realtime_bridge.py`。

## OpenSpec 与 diff

以下验证通过：

```bash
openspec validate normalize-tdx-qmt-source-layouts --strict
openspec validate align-realtime-native-ingress-contracts --strict
git diff --check
```

历史 `openspec/changes/archive/**` 与既有 evidence 未修改。

## Docker build 环境门禁

尝试执行：

```bash
docker build -t mist-theme-b-layout-check:local .
```

Docker Desktop 可连接，但本机没有 `node:24-alpine` 缓存，Docker Hub metadata 请求以
`DeadlineExceeded: context deadline exceeded` 失败。因此实际 Docker image build 尚未完成；Nest 的 Docker target build 已通过。该失败不是编译或测试失败，发布前需在可访问 Docker Hub/registry cache 的环境重跑。

## 发布与回滚顺序

1. 先合并并发布 `mist-datasource`，但不自动操作 Windows terminal bridge。
2. 操作员分别手工覆盖 `mist_tdx_realtime_bridge.py` 与
   `mist_qmt_realtime_bridge.py`，记录 installed path、commit、build id 与 SHA-256。
3. 再发布 `mist` backend；wire contract 不变，允许两个仓库按该顺序滚动发布。
4. 按 `align-realtime-native-ingress-contracts` tasks 5.1–5.7 执行 protected-table
   digest、盘中/盘后 HIL、restart/recovery 和 per-source `off` 回滚验证。

代码回滚时回退各仓库本 change commit，并分别恢复上一版 terminal bridge 文件。
TDX/QMT 可通过各自 `*_REALTIME_MODE=off` 独立止血；无需数据库 rollback。

## 剩余 gate

- 在有 registry 网络的环境完成 Mist Docker image build。
- Windows 手工覆盖两份 bridge 后执行正式 HIL；非交易时段不得声明 freshness。
- HIL 前后记录 protected tables row count 与 digest。
