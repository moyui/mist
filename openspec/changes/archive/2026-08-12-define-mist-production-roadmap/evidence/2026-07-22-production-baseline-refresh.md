# 2026-07-22 生产基线刷新证据

## 结论

本轮生产基线通过。Docker 应用、数据库备份恢复、TDX/QMT datasource、Windows
运行时、backend leader、Mac LAN 与 monitoring 均可观测。实时传输仍保持
memory-only；本轮午间验证不重复声明行情新鲜度，严格盘中新鲜度沿用 2026-07-22
已归档 HIL 证据。

## 精确版本

| 仓库/产物 | SHA |
|---|---|
| `mist` | `401b507694958c00982c5e285ccdb1087bf4590d` |
| `mist-fe` | `90b77c5cbc6dbd016d93fce5d38469831b949209` |
| `mist-datasource` | `d97e29f3aba61de3eb99baf523b8caa4fe7ab47a` |
| `mist-deploy` | `d5f8f2bb7841cd5d3f05ed18d8da89eab55ddea1` |
| `mist-monitoring` | `048dda32d9adc6bcb3021bc849b747a94cd34a05` |
| `mist-skills` | `86bd69b7f6f96be04cd17ad621af678a50e91b86` |
| TDX installed bridge | `063943212180e1c3369905e464c72c35f2a94c62a9513880f70520aaa9a5260c` |
| QMT installed bridge | `14b6143fa1d81f32606b7090a5d687041922ae78e0abc30e0e56e11b7bfb880b` |

六个本地仓库与 `origin/master` 均为 `0 ahead / 0 behind`，开始验证前工作区干净。

## 自动化结果

| 验证 | Run | 结果 |
|---|---:|---|
| Backend CI / image | `29888121624` | 成功 |
| Frontend CI / image | `29626469473` | 成功 |
| Windows Docker deploy | `29889296035` | 成功 |
| MySQL restore rehearsal | `29889402234` | 成功 |
| TDX runtime smoke (`600030.SH`) | `29889463656` | 成功 |
| QMT runtime smoke (`300502.SZ`) | `29889501739` | 成功 |
| TDX exact-SHA baseline | `29889598757` | 成功 |
| QMT exact-SHA baseline | `29889646810` | 成功 |

Evidence artifact digests：

- TDX：`sha256:ae2e44bf06d3a4cb7fbe3bfa9ea6c6c98583f040841965b1edbea4e3cb430020`
- QMT：`sha256:8aef7e4e2e9f2cbdd8f28ab5e5d70ef27e1dd69fd66326df0c635fe981f70347`

部署产物：

- 备份：`E:\quant\MistDocker\backups\mist-20260722-114727.sql`
- 诊断：`E:\quant\MistDocker\diagnostics\20260722-114747`
- Backend 镜像：`ghcr.io/mist-trade/mist:401b507694958c00982c5e285ccdb1087bf4590d`
- Frontend 镜像：`ghcr.io/mist-trade/mist-fe:90b77c5cbc6dbd016d93fce5d38469831b949209`

## Windows 运行时

- Windows 10 Pro `10.0.19045`，64 位。
- TDX：`F:\quant\tdx\TdxW.exe`，版本 `1.0.0.1`，SHA-256
  `7a07a6f7e8b78e1e73b8338a0b9751354184868a63a661b08fa85bc88df04a68`。
- TDX owner：`tdx-bridge-pid-1332`，bridge build `mist-tdx-bridge-v0.2`，
  Python `3.12.10`，`tqcenter.py` SHA-256
  `091cad459997693d9e4ef37466322a2811b220990ce3d00fe00c0f5869888d7d`。
- QMT：`F:\quant\qmt\bin.x64\XtItClient.exe`，版本 `2.1.19.0`，SHA-256
  `a03222ec9186eeb0afcddb9f11193fc0b2b908d4b31a38b43e584e69a160009e`。
- QMT owner：`bigqmt-31036`，owner 与终端同进程。
- QMT 内置 Python 3.6.8 来自同机历史 spike；当前临时 spike JSON 不存在，故本轮
  inventory 不把该版本冒充为重新采集结果。

## Datasource 与 realtime 状态

TDX：

- `/health` 200，`tdxHttpReachable=true`，backend WebSocket connected/ready。
- desired/converged revision 为 `2/2`，当前订阅数为 0，无 drop 或 decode error。
- accepted contract 为 `tdx.realtime.snapshot / schemaVersion=0 /
  draftRevision=1 / tdx.get_market_snapshot`。
- 午间最后快照 age 增长属于无订阅、非交易时段预期，不声明新鲜行情。

QMT：

- `/health` 200，bridge `ready=true`、`ownerStale=false`、pending/in-flight 为 0。
- native bars 与 bridge commands smoke 成功。
- realtime mode 为 `off`；exact-SHA baseline 中 realtime datasource/backend route
  为 404 且无 QMT realtime metrics，符合 fail-closed 约束。

## 数据库保护摘要

TDX 与 QMT evidence 捕获的摘要完全一致：

| 表 | 行数 | 内容摘要 |
|---|---:|---|
| `k` | 4375 | `91ccfd3e1bda07fa1b4e64b146460366cbbe27d63f052e8522d459813189226b` |
| `k_extensions_ef` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `k_extensions_tdx` | 4371 | `eba21ccd9ed20eb5ca15b50376bc1f5c642b88cf70bac43eb043de117f746a2d` |
| `k_extensions_qmt` | 4 | `bf9ecbf751d3d1b5b06dc229bf64b4502138998aca693b181e020a653c756af3` |
| `strategy_signals` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `strategy_alert_events` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Mac LAN 与监控

- `www.moyui.mist -> 192.168.31.182`。
- `/` 返回 307 到 `/k`；`/k`、Mist API、Chan API 均返回 200。
- `:9001/health` 与 `:9002/health` 从 Mac LAN 均返回 200。
- `mist_windows_exporter_up 1`。
- `mist_datasource_tdx_http_reachable 1`。
- `mist_experimental_realtime_ready{source="tdx"} 1`。

## 剩余边界

- Theme A 实时 transport HIL 已验收，但数据库快照、1 分钟合笔和通知上下文仍属于
  Theme B，不在本轮基线中冒充完成。
- QMT realtime 当前保持 `off`；启用前仍需走独立 mode switch 与盘中 HIL。
- 本轮未重启两个桌面终端；TDX/QMT desktop recovery 已在前序 HIL 单独验证，正常
  Docker 部署不得顺带重启终端或 datasource。
