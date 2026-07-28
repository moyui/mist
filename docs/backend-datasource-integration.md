# Backend 与 Datasource 集成

Mist backend 只通过产品接口连接独立的 TDX/QMT datasource。终端内置 bridge 的
HTTP 路由是运行时内部通道，不是 backend 的行情 API。

## 配置

| 变量               | 当前含义                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `TDX_BASE_URL`     | TDX datasource HTTP 地址；Docker 生产值为 `http://tdx-datasource:9001` |
| `QMT_BASE_URL`     | QMT datasource HTTP 地址；Docker 生产值为 `http://qmt-datasource:9002` |
| `TDX_WS_CLIENT_ID` | TDX realtime backend leader client id                                  |
| `QMT_WS_CLIENT_ID` | QMT realtime client id；仅在 QMT realtime mode 启用时使用              |

`DEFAULT_DATA_SOURCE` 接受 `ef`、`tdx` 或 `qmt`。TDX 与 QMT 是两个独立服务，
TDX request 不接受 `provider=qmt`。

宿主映射 `127.0.0.1:9001/9002` 只供 terminal bridge、Windows smoke 和运维检查；
backend 不经由宿主端口访问 datasource。

## 历史数据链路

### TDX

```text
Mist backend
  -> POST :9001/v1/bars/query
  -> TdxHttpClient
  -> official POST :17709 get_market_data
  -> normalized data.bars[]
```

`TdxSource.fetchK` 发送 `symbols`、`period`、`startTime`、`endTime`、`fields`、
`dividendType=front` 和 `fillData=true`。Backend 将基础字段写入 `k`，将 TDX
扩展字段写入 `k_extensions_tdx`。

### QMT

```text
Mist backend
  -> POST :9002/v1/bars/query
  -> QMT command gateway
  -> full-QMT builtin Python get_market_data_ex(..., subscribe=False)
  -> native data.marketData[symbol][field][stime]
```

QMT 请求保持官方 snake_case：`fields`、`stock_list`、`period`、`start_time`、
`end_time`、`count`、`dividend_type=front_ratio`、`fill_data`、`include_raw`。
Datasource 不读取 DAT、不依赖 MiniQMT、`xtquant` 或外部 QMT SDK。Backend 在自身
边界把 column shape 转成 `QmtResponse[]`，基础字段写入 `k`，扩展字段写入
`k_extensions_qmt`。

TDX 与 QMT 的字段、复权和 native shape 天生不同；统一业务模型发生在 backend，
datasource 不强迫两个 provider 返回相同原生结构。

### TDX 两条行情路径

TDX 的 HTTP/WS 是传输方式，不等同于历史/实时语义：

| Mist 路径                      | 数据性质             | TDX native 方法                         | 传输链路                                                                       |
| ------------------------------ | -------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `/v1/bars/query`               | 历史 K 序列          | `get_market_data`                       | backend → datasource HTTP → TDX JSON-RPC HTTP                                  |
| `/ws/realtime/tdx/{client_id}` | 持续实时 native 快照 | terminal-local `tq.get_market_snapshot` | terminal bridge → datasource bridge HTTP POST → datasource WebSocket → backend |

已删除没有生产业务调用方的按需 `/v1/snapshots/query`。实时 bridge 在 TDX
终端进程内直接调用 `tq.get_market_snapshot`，再通过内部
`/tdx/bridge/snapshot` HTTP POST 上传完整 native 对象。TDX realtime previous
close 只接受 exact native `LastClose`，然后由 backend 映射为 canonical
`prices.lastClose`；`PreClose`、`lastClose` 或大小写/空格变体均不作为 native
alias。

## 实时链路

### TDX

```text
TDX builtin script
  -> loopback /tdx/bridge/owner|poll|result|snapshot
  -> datasource /ws/realtime/tdx/{client_id}
  -> TdxRealtimeClient (backend leader)
  -> RealtimeSnapshotIngressService
```

TDX realtime 默认 `builtin`；`off` 仅用于受控回滚。`off` 时 datasource realtime
bridge/WS route、backend client/module 与 monitoring probe 同步停用，但 `/health` 和
`/v1/*` 继续工作。Builtin bridge 使用官方 `get_market_snapshot`，不使用 QMT 的
`get_full_tick`。Backend leader 在连接、
`realtime.ready` 和重连时发送完整 `sync_subscriptions`；普通 WebSocket 客户端不得修改生产
订阅。

生产终端脚本为 `mist-datasource/tdx/builtin_bridge/mist_tdx_realtime_bridge.py`。
发布 datasource commit 不会自动覆盖终端文件；Windows 验收前必须手工覆盖并记录
实际安装路径与 SHA-256。

### QMT

```text
QMT builtin script stdlib HTTP polling
  -> generation/lease-fenced QMT command gateway / native get_full_tick
  -> /ws/realtime/qmt/{client_id}
  -> QmtRealtimeClient
  -> RealtimeSnapshotIngressService
```

QMT realtime 默认 `builtin`；`off` 仅用于受控回滚。`off` 时 realtime route、
backend client/module 与 metric 不存在，但 `/health`、`/v1/bars/query` 和
`/qmt/bridge/*` 继续工作。

生产终端脚本为
`mist-datasource/qmt/builtin_bridge/mist_qmt_realtime_bridge.py`。它与
`tools/qmt_runtime_probe/mist_qmt_runtime_probe.py` 无关；后者只用于运行时能力复验。
QMT 与 TDX 一样需要在 Windows 终端内手工覆盖生产 bridge 并记录 SHA-256。

TDX/QMT 都发送 schema v1 `mist.realtime.native_snapshot`，外层包含 `source`、
`streamEpoch`、每个 symbol 独立的 `sequence`、`sequenceScope=symbol`、
`capturedAt` 和完整 `native`。Datasource 不计算统一 `eventTime` 或 `quality`；backend
在 source-specific adapter 中生成同一 `CanonicalRealtimeSnapshot`，并且只有通过
owner/epoch/sequence fencing 的 frame 才能进入共同 ingress。

Backend source service 使用显式 provider basename：
`tdx/tdx-source.service.ts`、`qmt/qmt-source.service.ts`；provider 目录已提供充分
作用域的 realtime 文件仍采用相同职责名，例如 `realtime/realtime.client.ts`。
类名继续保留 `Tdx*`/`Qmt*` 身份。Datasource 的 owner/command gateway 统一位于
`src/datasource/<source>/realtime/gateway.py`，contract 位于同级
`realtime/contract.py`。QMT 独有的 subscription collector 继续使用
`realtime/runtime.py`；TDX formula/raw 等 provider-only 能力不制造空壳对称模块。

## 当前持久化边界

已验收的是 realtime transport HIL。Realtime snapshot 当前保持 memory-only：

- 不写最新快照表；
- 不由 realtime client 合成或写入 1 分钟 K；
- 不触发 strategy signal/notification context；
- 不修改 `k`、`k_extensions_*`、`strategy_signals` 或
  `strategy_alert_events`。

这些能力属于后续 Theme B，不能因为 transport 通过就声明已经完成。

## 验证

```bash
env TZ=UTC pnpm run test:ci
pnpm run typecheck
pnpm run ci:contracts
openspec validate --all --strict
```

Windows 与 Mac 生产验证使用
[`production-baseline-verification.md`](production-baseline-verification.md)。
