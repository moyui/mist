# Mist 生产基线验证手册

本文是当前 Mist 生产环境的唯一基线运行手册。历史证据保存在
`openspec/changes/archive/`，不得把历史命令直接当作当前操作步骤。

最新已通过基线：

- 日期：2026-07-22
- 证据：`openspec/changes/define-mist-production-roadmap/evidence/2026-07-22-production-baseline-refresh.md`
- Backend：`mist@401b507694958c00982c5e285ccdb1087bf4590d`
- Frontend：`mist-fe@90b77c5cbc6dbd016d93fce5d38469831b949209`
- Datasource：`mist-datasource@d97e29f3aba61de3eb99baf523b8caa4fe7ab47a`
- Deploy：`mist-deploy@d5f8f2bb7841cd5d3f05ed18d8da89eab55ddea1`
- Monitoring：`mist-monitoring@048dda32d9adc6bcb3021bc849b747a94cd34a05`
- Skills：`mist-skills@86bd69b7f6f96be04cd17ad621af678a50e91b86`

2026-07-27 已完成 datasource Docker cutover。上面的 2026-07-22 SHA 清单仍是上一轮
完整六仓基线，不应被误读为本次 cutover 的镜像清单；新的完整基线需在当前
OpenSpec change 的交易时段 HIL 完成后重新冻结。

## 当前生产拓扑

```text
Windows Docker Desktop
  mysql
  mist-backend :8001
  chan-api :8008
  mist-fe
  web-gateway :80
  tdx-datasource :9001
  qmt-datasource :9002
  monitoring :9109
  mist-migrate（一次性迁移任务）

Windows 用户会话
  TDX 终端 + 已注册自动运行的 builtin bridge
  QMT 终端 + 随终端启动的 builtin bridge

Mac / 浏览器 / AstrBot
  http://www.moyui.mist
```

TDX 非实时 `/v1/*` 通过官方 `POST :17709`；TDX 实时通过
`/tdx/bridge/*` 与 `/ws/realtime/tdx/{client_id}`。QMT 历史 bars 和正式
命令都通过内置 Python 的 stdlib HTTP polling bridge；QMT realtime 默认
`off`。两个 datasource gateway 都在 Docker 中运行；TDX/QMT builtin bridge
仍由对应 Windows 桌面终端加载。TDX datasource 通过
`host.docker.internal:17709` 调用官方 TDX HTTP。

## 验证边界

### 非交易时段可以验证

- 六仓库精确 SHA 与 CI 状态。
- Docker 部署、迁移、备份、恢复演练和健康检查。
- TDX `:17709` 历史、参考、财务、报告和公式接口。
- QMT native bars、bridge command、`get_full_tick` 已有快照和板块命令。
- TDX/QMT owner、revision、订阅恢复、WebSocket 握手和 ping/pong。
- Windows exporter、Mac LAN、gateway 和 container-to-host 路由。
- 受保护数据库表的行数与确定性内容摘要。

### 必须在支持的交易时段验证

- 新产生的 TDX/QMT native snapshot。
- `eventTime`、sequence 与价格字段的新鲜度。
- 启用订阅后的持续回调和重启后的新 epoch 快照。

A 股严格验收优先使用北京时间 `09:40-11:15` 或 `13:10-14:45`。午休、开盘
缓冲和收盘缓冲只能证明控制链路，不能声明实时行情新鲜。

## 1. 本地与 CI 门禁

Backend 本地门禁：

```bash
env TZ=UTC pnpm run test:ci
pnpm run typecheck
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```

使用当前提交前，确认对应 GitHub Actions 已成功：

```bash
gh run list --repo mist-trade/mist --workflow "Build Docker Images" --limit 5
gh run list --repo mist-trade/mist-fe --workflow "Build Frontend Docker Image" --limit 5
gh run list --repo mist-trade/mist-datasource --limit 5
gh run list --repo mist-trade/mist-deploy --workflow "Test Deploy Scripts" --limit 5
gh run list --repo mist-trade/mist-monitoring --limit 5
gh run list --repo mist-trade/mist-skills --limit 5
```

生产镜像必须使用完整 commit SHA，不允许使用 `latest`。

## 2. Windows Docker 部署

在 `mist-deploy` 触发 `Deploy Windows Mist Stack`：

```bash
gh workflow run deploy-windows-mist-stack.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f image_repository=ghcr.io/mist-trade/mist \
  -f image_tag=<backend-sha> \
  -f previous_image_tag=<previous-backend-sha> \
  -f frontend_image_repository=ghcr.io/mist-trade/mist-fe \
  -f frontend_image_tag=<frontend-sha> \
  -f previous_frontend_image_tag=<previous-frontend-sha> \
  -f public_host_name=www.moyui.mist \
  -f 'docker_root=E:\quant\MistDocker' \
  -f 'datasource_state_root=F:\quant\MistAPI\datasource\state' \
  -f skip_migration=false \
  -f skip_backup=false \
  -f skip_health_check=false \
  -f skip_pull=false
```

成功输出必须包含：目标 backend/frontend 标签、备份路径、诊断路径、迁移成功、
五个长期 Compose 服务健康，以及 TDX/QMT host 和 container-to-host health。

## 3. MySQL 恢复演练

使用部署输出的备份文件触发 `Test Windows MySQL Restore`：

```bash
gh workflow run test-windows-mysql-restore.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f 'docker_root=E:\quant\MistDocker' \
  -f 'backup_path=<部署输出的备份绝对路径>' \
  -f timeout_seconds=120 \
  -f keep_container=false
```

该 workflow 只能恢复到临时 MySQL 容器，不得覆盖生产数据库。

## 4. Datasource 运行态 smoke

TDX 使用不同于 QMT 的标的，例如 `600030.SH`：

```bash
gh workflow run run-windows-tdx-runtime-smoke.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f symbol=600030.SH \
  -f period=1d \
  -f count=2 \
  -f include_reference_instrument_smoke=true \
  -f include_finance_report_smoke=true \
  -f include_formula_smoke=true \
  -f require_live_quote=false \
  -f allow_websocket_subscription_change=false \
  -f skip_websocket=false
```

QMT 使用例如 `300502.SZ`：

```bash
gh workflow run run-windows-qmt-runtime-smoke.yml \
  --repo mist-trade/mist-deploy \
  --ref master \
  -f stock_code=300502.SZ \
  -f period=1d \
  -f count=1 \
  -f realtime_mode=off \
  -f include_raw_bars=true \
  -f require_bars_data=true \
  -f include_bridge_commands=true \
  -f include_full_tick=true \
  -f include_sector_list=true
```

TDX realtime WebSocket 是 `/ws/realtime/tdx/{client_id}`，不是已删除的
`/ws/quote/{client_id}`。订阅集合由 backend leader 管理，普通 smoke 客户端不得
直接修改生产订阅。

## 5. Exact-SHA 与数据库保护证据

使用 `Collect Windows Realtime Evidence` workflow 的 `baseline` phase。
每次必须提供四个 40 位仓库 SHA、64 位 bridge SHA-256 和实际安装路径。

`baseline` 只读运行态和数据库，并写 evidence JSON；不得切换 realtime mode、重启
服务或修改订阅。TDX/QMT 两份 evidence 的受保护表摘要必须一致：

- `k`
- `k_extensions_ef`
- `k_extensions_tdx`
- `k_extensions_qmt`
- `strategy_signals`
- `strategy_alert_events`

TDX 或 QMT realtime 为 `off` 时，对应 realtime datasource/backend route 为 404、
没有该 source 的 realtime metrics，属于 fail-closed 的预期结果；该 datasource 的
`/health` 与历史查询仍必须成功。

## 6. Mac LAN 与监控验证

```bash
dscacheutil -q host -a name www.moyui.mist
curl --noproxy '*' http://www.moyui.mist/
curl --noproxy '*' http://www.moyui.mist/k
curl --noproxy '*' http://www.moyui.mist/api/mist/app/hello
curl --noproxy '*' http://www.moyui.mist/api/chan/app/hello
curl --noproxy '*' http://<windows-lan-ip>:9001/health
curl --noproxy '*' http://<windows-lan-ip>:9002/health
curl --noproxy '*' http://<windows-lan-ip>:9109/metrics
```

已知正确形状：

- `/` 返回 307 并跳转 `/k`，`/k` 返回 200。
- Mist、Chan、TDX health、QMT health 返回 200。
- TDX health 包含 `tdxHttpReachable=true`、bridge owner 与收敛 revision。
- QMT health 包含 `bridge.ready=true`、`ownerStale=false`。
- exporter 包含 `mist_windows_exporter_up 1` 和 TDX bridge 指标。
- TDX 或 QMT realtime 为 `off` 时不要求对应 source 的 realtime 指标。

## 7. 完成与回滚

把每轮证据写入当前 active roadmap 的 `evidence/`，记录精确 SHA、workflow run
链接、备份和诊断路径、盘中/盘后边界、失败项和接受理由。随后运行：

```bash
openspec validate --all --strict
```

任何必要阶段失败时，停止声明新基线。应用回滚使用部署时传入的 previous image
SHA；数据库迁移不自动回滚，必须依据部署前备份单独决策。Datasource 与桌面终端
恢复使用各自独立 workflow，不得用 Docker 部署替代。
