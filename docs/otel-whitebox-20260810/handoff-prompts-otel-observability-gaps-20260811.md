# 交接提示词 — OTel 观测缺口补强（gaps）落地与生产部署

> 来源：2026-08-10/11 主线程（otel-observability-gaps：埋点补强 + 日志进 OO + 官方方案收敛）。
> **本线程职责：① 排查生产 candle 数据链路（tdx.snapshot.ingest 无流）→ ② 交易时段验证归因/verdict/logs
> （gaps tasks 5.2）→ ③ 后续 remediate-otel-audit-findings（G2-G5）。**
> 先读：`otel-whitebox-20260810/handoff-prompts-otel-o1-o2a-20260810.md`（OTel 已知坑）、
> `audit-2026-08-10-otel-governance.md`（审计发现 G1-G6）、`mist/docs/otel-observability-queries.md`（OO 查询）。

---

## 一、本次干了什么（三仓 commit）

| 仓库 | commit | 内容 |
|---|---|---|
| mist | `65a1053`（6 commits） | **gaps 全部**：spec 定稿（proposal/design/tasks + live specs/mist-observability 子 spec）；G0 官方 register 切换；A1-A3 埋点补强（归因/verdict/attributes）；B1 日志进 OO（instrumentation-pino）；B2 查询文档；双发修复 |
| mist-deploy | `c8a222f` | compose 3 处 command：`-r @opentelemetry/auto-instrumentations-node/register` + CI 门禁同步 |
| mist-datasource | `c1e7985` | run-mock.sh NODE_OPTIONS 换 register；`.env.mock` 加 `OTEL_SERVICE_NAME=mist-backend` |

## 二、生产状态（2026-08-11 部署成功，run 31450641803）

| 项 | 值 |
|---|---|
| mist 镜像 | `65a1053`（prev bc1fdf2） |
| datasource / frontend | `7cb8630` / `ea4632a0`（未变） |
| mode | productization=**shadow**（显式传）、lifecycle=off、strategy=on（未触碰） |
| 生产 OO | 192.168.31.182:5080（<OO_USER_REDACTED> / <OO_PASSWORD_REDACTED>） |
| 生产验证 | ✅ mist-backend GET spans、logs 单发、service_name=mist-backend |
| ⚠️ **candle spans 生产空** | tdx-datasource poll/result 流动（桥连接正常）但 `tdx.snapshot.ingest` 无——**行情帧未进 snapshot 管道**（订阅/桥数据问题） |

## 三、关键技术结论（后续 OTel 工作必读）

1. **官方 register 兼容 webpack bundle**（08-11 实证）：`-r @opentelemetry/auto-instrumentations-node/register`
   在真实 bundle 环境全链路工作（spans/logs/metrics）。之前"失败"误判根因：**mock 未设 OTEL_SERVICE_NAME
   → service_name=unknown_service:node**（查询条件过滤导致查空）。**OTEL_SERVICE_NAME 必须设**（生产 compose 已设 4 app）。
2. **日志单发官方路径**：instrumentation-pino（register 已含）→ LoggerProvider（env 默认 otlp）→
   **顶层 trace_id/span_id 注入**。前提：**pino webpack external**（RITM patch）。
3. **双发坑**：pino-opentelemetry-transport + pinoTraceMixin 同时存在 → 每条日志 2 份（cnt=2）——
   已删 transport/mixin/libs/otel 整体，单一官方路径后 cnt=1。
4. **webpack 打包 pino 会破坏 transport worker 的 __dirname**（pino/lib/worker.js 路径错乱）——external 解决。
5. **唯一保留自研**：`withCandleSpan`（官方 startActiveSpan 2.x 手动 end 的必需封装，try/finally）。
6. **OO attributes 拍平**：span attributes 拍平到 hit 顶层（小写：bucketstartms/securityid/verdict）；
   新字段首次出现后 OO schema 化（probe 实证 verdict 可查）。
7. **部署注意**：compose register 与 mist 新镜像**必须一起部署**（旧镜像 + register = 双 SDK）；
   部署被 TDX 终端 17709 阻断时用 `Recover Windows TDX Runtime`（卡人工登录窗口时需用户手动）。

## 四、待办序列

### 步骤 1：排查生产 candle 数据链路（优先级最高）
- 现象：tdx-datasource `POST /tdx/bridge/poll` ×248、`result` ×246 流动，但 `tdx.snapshot.ingest` 无 span
- 排查方向：① 生产订阅/allowlist（TDX_REALTIME_ALLOWLIST 部署状态）② 桥的 result 内容（空响应 vs 行情帧）
  ③ vwap 线程 E-0 实测范畴（方案 B 回调直发——桥数据正确性）
- 参考：`handoff-prompts-fix-tdx-quantity-vwap.md`（vwap 线程交接）

### 步骤 2：交易时段验证（gaps tasks 5.2，数据流恢复后）
生产 OO 查询（`curl -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>'`）：
```sql
-- candle spans
select operation_name, count(*) from 'default'
where service_name='mist-backend' and operation_name like 'candle%' group by operation_name
-- skip 归因（source+securityId label）
select * from mist_candle_skip_total order by _timestamp desc limit 10
-- finalize verdict
select * from 'default' where operation_name='candle.due.finalize' and service_name='mist-backend' order by _timestamp desc limit 5
-- logs 按顶层 trace_id
select * from 'default' where trace_id = '<traceId>' limit 50
```
判定：snapshot.process OK spans、skip/discard 按 source+securityId 归因、finalize verdict 可见、
logs 单发（cnt=1）+ trace_id 关联。

### 步骤 3：remediate-otel-audit-findings（G1 已随 gaps 完成，剩 G2-G5）
- G2：OO_OTLP_AUTH_BASE64 凭据默认值收敛（compose/.env.example——**§5 用户拍板项**）
- G3：skip/discard label 词汇（securityId 已随 gaps A1 定稿——**已随 gaps 完成**，核对）
- G4：mist-monitoring 仓残留处置（退役标记/文档对齐——用户拍板）
- G5：日志 transport 资源边界（**已随 gaps B1 官方路径解决**——OTel 标准 env 可配，核对）
- spec 已建好（openspec/changes/remediate-otel-audit-findings），validate 通过

### 其他
- mock 环境：datasource/redis 手动起的进程在跑（8001 backend 已停）——不再需要可清理
- worktree `feat/otel-observability-gaps`（.worktrees/otel-observability-gaps）已合并——可删可留

## 五、验证命令速查

```bash
# mock 全链路（含 backend span/trace_id 断言）
bash mist-datasource/tools/mock-env/mock-verify.sh
# 生产 OO spans（candle）
curl -sS -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>' -X POST \
  "http://192.168.31.182:5080/api/default/_search?type=traces" -H "Content-Type: application/json" \
  -d '{"query":{"sql":"select * from '\''default'\'' where operation_name like '\''candle%'\'' and service_name='\''mist-backend'\'' order by _timestamp desc limit 5","start_time":<now_us-2h>,"end_time":<now_us>},"size":5}'
# 生产 logs
curl -sS -u <OO_USER_REDACTED>:'<OO_PASSWORD_REDACTED>' -X POST \
  "http://192.168.31.182:5080/api/default/_search?type=logs" -H "Content-Type: application/json" \
  -d '{"query":{"sql":"select * from '\''default'\'' where service_name='\''mist-backend'\'' order by _timestamp desc limit 20","start_time":<us>,"end_time":<us>},"size":20}'
```
