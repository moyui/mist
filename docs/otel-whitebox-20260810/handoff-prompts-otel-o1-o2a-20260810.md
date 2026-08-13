# 交接提示词 — OTel 白盒监控 O1/O2a 部署收尾与开盘验证

> 来源：2026-08-09/10 白盒监控线程（OTel SDK + OpenObserve 迁移的第二阶段：backend/datasource 管道埋点）。
> **本线程职责：确认开盘后生产 candle spans 生效 → 观察首日指标 → 推进后续 O2b/O3/O4 白盒 change。**
> 先读 `mist/docs/project-quality-governance-guide.md`（§4 归档条件、§10 验证清单）与 `mist-monitoring/docs/metrics-overview.md`。

---

## 一、当前状态锚点（2026-08-10 凌晨部署完成）

### 生产部署（run 31338248701，success）

| 项 | 值 |
|---|---|
| mist backend 镜像 | `6665770`（master，含 O1 全部埋点 + preload 修复） |
| previous mist | `a6ce18e`（可回滚） |
| datasource 镜像 | `fb38428`（含 O2a 埋点，本次未变） |
| frontend 镜像 | `ea4632a0`（未变） |
| deploy 仓 | `59e3761`（compose 3 个 node app 加 `-r ./otel-preload.js`） |
| mode | productization=**off**、lifecycle=**off**（部署归一化，符合预期）、strategy=**on 保持**（08-07 owner 拍板，本次未触碰） |

### 生产 OpenObserve（192.168.31.182:5080）
- 凭据：`<OO_USER_REDACTED>` / `<OO_PASSWORD_REDACTED>`（**不是** mock 的 <MOCK_USER_REDACTED>）
- 已验证入库：mist-backend `GET` ×22（http instrumentation）、`tcp.connect`、`dns.lookup`
- 已验证入库：mist-backend metrics（`mist_candle_*` 10 个 gauge + nodejs/v8js runtime metrics）
- **修复前**（a6ce18e）生产 mist-backend 在 OO 里**零 spans** —— preload 修复是本次关键

---

## 二、本次干了什么（三仓 commit）

| 仓库 | commit | 内容 |
|---|---|---|
| mist | `9c0378f` | **O1 实现**：nestjs-pino + pinoTraceMixin、10 个 observable candle gauges、candle.snapshot.process / candle.due.finalize 根 span + 判断点 events、otel-preload.js、webpack external @opentelemetry/api、withCandleSpan（2.x 手动 end）、Dockerfile preload |
| mist | `6665770` | 补测试修 coverage ratchet：pinoTraceMixin + candle-metrics.spec（全阈值达标） |
| mist | `3b3a3e4` | 归档 `instrument-backend-candle-pipeline`（29 tasks 全勾，--skip-specs rename-only） |
| datasource | `2878e43` | run-mock.sh 用 NODE_OPTIONS preload backend OTel；mock-verify.sh 加 candle span + trace_id 断言；修 .gitignore |
| datasource | `445b441` | 补勾 O2a 21 tasks + 归档 `instrument-datasource-bridge-ingest` |
| deploy | `59e3761` | compose：backtest/signal/chan command 加 `-r ./otel-preload.js`；CI 门禁同步 |

---

## 三、关键技术坑（后续所有 OTel 工作必读）

1. **webpack bundle 必须 `node -r otel-preload.js` 启动**：bundle 顶层 require（express→http）先于 initTelemetry，RITM 只 patch 未缓存模块 → 不 preload 则 http/pino/express 全部静默失效（**生产已接入：Dockerfile CMD + compose 3 处**）。
2. **`@opentelemetry/api` 必须 webpack external**：否则 bundle 内 api 副本读到 noop global provider，应用自建 span 全丢（instrumentation 的 span 正常，容易误判）。已在 webpack.config.js。
3. **startActiveSpan 2.x 不再自动 end**：所有 span 必须手动 end（统一走 `withCandleSpan` helper，try/finally）。
4. **pino 打包进 bundle 无法被 instrumentation-pino patch**：用 `pinoTraceMixin`（libs/otel）从活动 span 盖 trace_id/span_id。
5. **GitHub workflow_dispatch 输入 schema 缓存滞后**：新 choice 值（如 productization off/shadow/on）会 422；**不传**该输入 → 字面量 false → 归一化 off。需要 on/shadow 时用 `set-windows-*` 系列 workflow 补设。
6. **OO 搜索 API**：`POST /api/default/_search?type=traces`，body `{"query":{"sql":"select * from 'default' where ...","start_time":<微秒>,"end_time":<微秒>},"size":N}`；字段在 hit 顶层（operation_name/service_name/span_status）；时间窗口**微秒**。

---

## 四、待办序列（严格按序）

### 步骤 1：开盘后确认 candle spans（今天 09:30 后，优先级最高）
生产 OO 查询（`curl -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>'`）：
```sql
select operation_name, count(*) from 'default'
where service_name = 'mist-backend' and operation_name like 'candle%'
group by operation_name
```
预期出现：`candle.snapshot.process`（每帧一个，status OK）、`candle.due.finalize`（due 到期后）。
同时确认 `mist_candle_sealed_total` 等 gauge 开始有非零值。

### 步骤 2：首日观察
- 交易时段看 candle spans 数量与 sealed/discard gauge 变化
- 若 span 缺失：查 `tdx.snapshot.ingest`（datasource）是否正常 → 链路断点定位（backend preload env 在生产 compose 已确认存在）

### 步骤 3：后续白盒 change（规划中，未创建 spec）
- O2b：datasource 剩余埋点/日志（如需要）
- O3：日志平台/告警链路（OO 告警）
- O4：遗留清理（Prometheus/Grafana 残留确认已删）

### 其他
- mock 环境（127.0.0.1）仍在跑（run-mock.sh 起的栈），不需要可 `stop-mock.sh`
- mist 遗留分支 `feat/alert-delivery-wecom`（deliver-strategy-notifications 旧工作，未动，待用户拍板清理）

---

## 五、验证命令速查

```bash
# 生产 OO spans（candle）
curl -sS -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>' -X POST \
  "http://192.168.31.182:5080/api/default/_search?type=traces" \
  -H "Content-Type: application/json" \
  -d '{"query":{"sql":"select * from \'default\' where operation_name like \'candle%\' and service_name=\'mist-backend\' order by _timestamp desc limit 5","start_time":<now_us-2h>,"end_time":<now_us>},"size":5}'

# 生产 metrics（按 stream 名查，type=metrics）
curl -sS -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>' -X POST \
  "http://192.168.31.182:5080/api/default/_search?type=metrics" \
  -H "Content-Type: application/json" \
  -d '{"query":{"sql":"select * from mist_candle_sealed_total limit 3","start_time":<us>,"end_time":<us>},"size":3}'

# mock 环境全量验证（含 backend span + trace_id 断言）
bash mist-datasource/tools/mock-env/mock-verify.sh
```
