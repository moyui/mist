# Phase 2：mock 环境 — 实施计划 v4（代码级细化）

> mock-realtime-mode change 的第 3 节（Phase 2）。backend mock 模式（master `92d818c`）已落地。
> **v4 修正（2026-08-07 用户拍板）**：mock 环境工具集整体放 **mist-datasource 仓 `tools/mock-env/`**
> （注入器是 datasource bridge 的客户端、fixture 就近），mist/package.json 不加 mock scripts。
> 其余同 v3：全本机形态（三仓本机进程，仅 redis 一个容器），注入器扮演终端经 bridge 推真实 fixture。

---

## 0. 最终架构（用户逐项拍板）

```
macOS 宿主机（全本机进程，无镜像 build）
  ├─ redis 容器        docker run -d -p 6379:6379 redis:7-alpine
  ├─ tdx-datasource    mist-datasource 仓：uv run uvicorn（9001）
  ├─ qmt-datasource    mist-datasource 仓：uv run uvicorn（9002）
  ├─ mist-backend      mist 仓：pnpm start:debug（8001，MIST_MOCK_MODE=true）
  └─ monitoring        mist-monitoring 仓：go run（9109）
        ▲
mist-datasource/tools/mock-env/mock-drive.py（扮演终端）
  ├── TDX: POST /tdx/bridge/owner→poll→result→snapshot
  └── QMT: POST /qmt/bridge/owner→订阅poll/result→snapshot
数据源：真实 fixture（tests/fixtures/tdx/live_market_snapshot_600519.json；
       tests/fixtures/realtime/realtime-native-frame-v2.json qmt 例）
```

**决策记录**：
- datasource = 真实服务（本机 `uv run` 即真实代码），注入器只扮演终端
- 三仓都本机跑（datasource 和 monitoring 也可能要调试，容器化不适合）→ 热重载/断点/日志直出
- 仅 redis 容器化（不需要调试，`redis-cli` 直接看 key）
- **工具集归属**：`tools/mock-env/` 放 datasource 仓——注入器全部调用对象是 datasource bridge
  路由、fixture 在 tests/fixtures/ 本地、与现有 `tools/qmt_runtime_probe` 结构一致；
  mist/package.json **不加** mock scripts（启动入口在 datasource 仓，2026-08-07 用户拍板）
- 脚本只编排（不做镜像 build、不做 compose）

---

## 1. 核心事实（已调研确认）

### 1.1 TDX 注入序列（bridge HTTP，扮演终端）

```
① POST /tdx/bridge/owner  {ownerId,mode:"builtin",bridgeBuildId,bridgeArtifactSha256,acquisitionProfile:"tdx.get_market_snapshot",schemaVersion:2}
   → {leaseToken, streamEpoch, generation}
② POST /tdx/bridge/poll   {leaseToken, streamEpoch, appliedRevision:-1}   （间隔<10s 保活）
   → {desiredRevision, desiredSymbols, ...}
③ POST /tdx/bridge/result {leaseToken, streamEpoch, desiredRevision, appliedRevision, active:[symbol], rejected:[]}
   → {converged:true}
④ POST /tdx/bridge/snapshot {leaseToken, streamEpoch, symbol, capturedAt(RFC3339带时区),
     native:{Code,ErrorId:0,Now,Open,Max,Min,LastClose,Volume:"<str>",Amount:"<str>"}}
   → HTTP 200 {} → datasource 广播 realtime.native_snapshot 给 backend WS
```

注意：TDX 的 **desired 只能经 WS 控制面设置**（backend 连 WS 后发 sync_subscriptions）。**mock 里由 backend 自己发**——注入器只需 owner→poll→result→snapshot，不需要自己连 WS。若 backend 未自动 sync，注入器需补一个 WS 客户端发 sync_subscriptions（落地时实测确认）。

### 1.2 QMT 注入序列（bridge HTTP，扮演终端）

```
① POST /qmt/bridge/owner  {ownerId,bridgeBuildId,bridgeArtifactSha256}
   → {leaseToken, generation}
② WS（注入器或 backend 发）sync_subscriptions["300502.SZ"] → datasource 生成 native 命令
③ POST /qmt/bridge/subscriptions/poll {ownerId,leaseToken,generation}
   → {command:{callSequence,method:"subscribe_whole_quote",symbols:[...]}}
④ POST /qmt/bridge/subscriptions/result {ownerId,leaseToken,generation,callSequence,success:<sub_id int>}
   → {accepted:true}；WS 收 subscriptions_synced
⑤ POST /qmt/bridge/subscriptions/snapshot {ownerId,leaseToken,generation,subscriptionId:<sub_id>,
     capturedAt, native:{"300502.SZ":{timetag,lastPrice,open,high,low,lastClose,volume:int,amount:float}}}
   → {accepted:["300502.SZ"], rejected:[]} → datasource 广播
```

### 1.3 测试数据（真实 fixture，只读引用）

| 源 | 数据 | 内容 |
|---|---|---|
| TDX | `tests/fixtures/tdx/live_market_snapshot_600519.json` | 600519.SH 实盘捕获，nativePayload 即 bridge 要的 native（Volume/Amount 字符串）|
| QMT | `tests/fixtures/realtime/realtime-native-frame-v2.json` 的 qmtOneEntry | 300502.SZ，volume int / amount float |

**关键**：fixture 的 capturedAt 是过去日期（会被 backend 三层拒绝）——**只取价格/量额部分，
capturedAt 由注入器动态生成（当前时间）**。注入器支持 `--price-offset` 微调价格验证指标反应。

### 1.4 其他事实（全本机，全 127.0.0.1）

| 项 | 值 |
|---|---|
| backend 连 datasource | `TDX_BASE_URL` 默认 `http://127.0.0.1:9001`——**本机跑零 env 体操，即生产默认** |
| backend 连 redis | `MIST_REALTIME_REDIS_URL=redis://127.0.0.1:6379/0`（docker run 映射）|
| backend mock 模式 | `MIST_MOCK_MODE=true`（已合 master `92d818c`）|
| QMT owner stale | 15s（无显式心跳路由，靠每次调用续期）|
| TDX owner stale | 10s（poll 保活）|
| bridge loopback | 注入器与 datasource 同宿主机 → `_require_loopback` 直接放行，**无容器网关问题** |
| datasource 两进程 | tdx 9001 + qmt 9002（同一 FastAPI 框架两个 app 入口，各自 `uv run`）|

---

## 2. 文件清单（新建 7，均在 mist-datasource 仓；mist 仓零改动）

```
mist-datasource/tools/mock-env/run-mock.sh           # 编排：redis 容器 + 三仓进程 + 等健康
mist-datasource/tools/mock-env/stop-mock.sh          # 编排：按 pidfile 杀进程 + docker rm redis
mist-datasource/tools/mock-env/mock-drive.py         # 注入器（扮演终端，TDX+QMT 双源）
mist-datasource/tools/mock-env/mock-verify.sh        # 验证：curl exporter /metrics + candle health
mist-datasource/tools/mock-env/.env.mock             # backend mock env（全 localhost）
mist-datasource/tools/mock-env/config.monitoring.yaml # exporter 配置（localhost targets）
mist-datasource/tools/mock-env/README.md             # 使用说明（前置依赖/启动/drive/verify/清理）
```

（v3 里的 `mist/package.json` mock scripts 已取消——启动入口在 datasource 仓。）

---

## 3. 每个文件的代码级设计

### 3.1 `run-mock.sh`（编排：redis + 三仓进程）

```bash
#!/usr/bin/env bash
# Start the mock verification environment (all local processes + one redis
# container). Stop with stop-mock.sh. Plays terminal role separately:
#   python3 tools/mock-env/mock-drive.py --source tdx --frames 5
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # mist-datasource 根
BACKEND="$ROOT/../mist"
MONITORING="$ROOT/../mist-monitoring"
PIDS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.mock-pids"
mkdir -p "$PIDS_DIR"

# 0. prerequisites
command -v docker >/dev/null || { echo "docker required"; exit 1; }
command -v uv >/dev/null || { echo "uv required (datasource)"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm required (backend)"; exit 1; }
command -v go >/dev/null || { echo "go required (monitoring)"; exit 1; }

# 1. redis container (the only container; nothing to debug there)
if ! docker ps --format '{{.Names}}' | grep -q '^mist-mock-redis$'; then
  docker rm -f mist-mock-redis >/dev/null 2>&1 || true
  docker run -d --name mist-mock-redis -p 6379:6379 \
    redis:7-alpine --appendonly no --save ""
fi

# 2. datasource (two uvicorn apps: tdx 9001 / qmt 9002)
(cd "$ROOT" && uv sync --quiet)
nohup bash -c "cd '$ROOT' && exec uv run uvicorn tdx.main:app --port 9001" \
  >"$PIDS_DIR/tdx-datasource.log" 2>&1 & echo $! >"$PIDS_DIR/tdx-datasource.pid"
nohup bash -c "cd '$ROOT' && exec uv run uvicorn qmt.main:app --port 9002" \
  >"$PIDS_DIR/qmt-datasource.log" 2>&1 & echo $! >"$PIDS_DIR/qmt-datasource.pid"

# 3. backend (mock mode; start:debug watches src)
set -a; source "$(dirname "${BASH_SOURCE[0]}")/.env.mock"; set +a
nohup bash -c "cd '$BACKEND' && exec pnpm start:debug" \
  >"$PIDS_DIR/backend.log" 2>&1 & echo $! >"$PIDS_DIR/backend.pid"

# 4. monitoring exporter (go run; config targets localhost)
(cd "$MONITORING" && go mod download)
nohup bash -c "cd '$MONITORING' && exec go run ./cmd/exporter -config '$(dirname "${BASH_SOURCE[0]}")/config.monitoring.yaml'" \
  >"$PIDS_DIR/monitoring.log" 2>&1 & echo $! >"$PIDS_DIR/monitoring.pid"

# 5. wait healthy
echo "==> waiting for backend /app/hello"
for i in $(seq 1 90); do
  curl -fsS http://127.0.0.1:8001/app/hello >/dev/null 2>&1 && break
  sleep 2
done
echo "==> waiting for datasources"
for i in $(seq 1 30); do
  T=$(curl -fsS http://127.0.0.1:9001/health 2>/dev/null | grep -c ok || true)
  Q=$(curl -fsS http://127.0.0.1:9002/health 2>/dev/null | grep -c ok || true)
  [ "$T" -ge 1 ] && [ "$Q" -ge 1 ] && break
  sleep 1
done
echo "stack up. Inject frames: python3 tools/mock-env/mock-drive.py --source tdx --frames 5"
echo "logs: tools/mock-env/.mock-pids/*.log"
```

**落地时核实**：
- datasource 仓的 app 入口模块名（`tdx.main:app` / `qmt.main:app` 或 `main:app` + 路由区分）——按 compose 先例 qmt 是 `uvicorn qmt.main:app`，tdx 待确认
- backend `start:debug` script 名（package.json 里现有 dev/start:dev/start:debug 之一；mock 用非 watch 的 `pnpm start:dev` 也行，调试时用户自己换 start:debug）
- monitoring 的 cmd 入口路径（`./cmd/exporter` 或 `./cmd/watchdog`）与 `-config` flag 名——落地对照 mist-monitoring 仓实际结构

### 3.2 `stop-mock.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
PIDS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.mock-pids"
for f in "$PIDS_DIR"/*.pid; do
  [ -e "$f" ] || continue
  kill "$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
done
docker rm -f mist-mock-redis >/dev/null 2>&1 || true
echo "mock stack stopped."
```

### 3.3 `.env.mock`（backend mock env，全 localhost）

```
MIST_MOCK_MODE=true
NODE_ENV=development
PORT=8001
REALTIME_PRODUCTIZATION_MODE=shadow
REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on
REALTIME_STRATEGY_MODE=off
TDX_REALTIME_MODE=builtin
QMT_REALTIME_MODE=builtin
TDX_REALTIME_ALLOWLIST=
QMT_REALTIME_ALLOWLIST=
MIST_REALTIME_REDIS_URL=redis://127.0.0.1:6379/0
# TDX_BASE_URL/QMT_BASE_URL 不设 → 默认 http://127.0.0.1:9001/9002（生产默认，零漂移）
```

### 3.4 `config.monitoring.yaml`

```yaml
listen:
  host: 127.0.0.1
  port: 9109
targets:
  - name: realtime-candles
    kind: http
    address: http://127.0.0.1:8001/internal/realtime/candles/status
    timeout_ms: 1500
    candle: true
  - name: datasource-tdx
    kind: http
    address: http://127.0.0.1:9001/health
    timeout_ms: 1500
    datasource: tdx
  - name: datasource-qmt
    kind: http
    address: http://127.0.0.1:9002/health
    timeout_ms: 1500
    datasource: qmt
```

（完整内容落地时对照 mist-monitoring `config.example.yaml` 补全。）

### 3.5 `mock-drive.py`（注入器，扮演终端）

```python
#!/usr/bin/env python3
"""Inject synthetic TDX/QMT native frames via the datasource bridge, playing
the terminal role. The datasource is real; only the terminal is mocked.

Usage:
  mock-drive.py --source tdx --frames 10 --rate 1
  mock-drive.py --source qmt --frames 5
  mock-drive.py --source tdx --pause 30        # pause to observe stall/discard
"""
import argparse, json, time, urllib.request, pathlib

TDX_BASE = "http://127.0.0.1:9001"
QMT_BASE = "http://127.0.0.1:9002"

# Real fixture data (read-only references; capturedAt is regenerated because
# fixture timestamps are past dates rejected by the backend).
DS_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent   # mist-datasource 根
TDX_FIXTURE = DS_ROOT / "tests" / "fixtures" / "tdx" / "live_market_snapshot_600519.json"
QMT_FIXTURE = DS_ROOT / "tests" / "fixtures" / "realtime" / "realtime-native-frame-v2.json"

def post(base, path, body):
    req = urllib.request.Request(f"{base}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def now_rfc3339():
    # local time with +08:00 offset (A-share trading session)
    return time.strftime("%Y-%m-%dT%H:%M:%S+08:00")

def tdx_converge(lease, epoch, symbol):
    poll = post(TDX_BASE, "/tdx/bridge/poll",
                {"leaseToken": lease, "streamEpoch": epoch, "appliedRevision": -1})
    rev = poll["desiredRevision"]
    result = post(TDX_BASE, "/tdx/bridge/result", {
        "leaseToken": lease, "streamEpoch": epoch,
        "desiredRevision": rev, "appliedRevision": rev,
        "active": [symbol], "rejected": []})
    assert result["converged"], f"tdx converge failed: {result}"

def drive_tdx(args):
    data = json.loads(TDX_FIXTURE.read_text())
    symbol = data["symbol"]                       # 600519.SH
    native = data["nativePayload"]
    owner = post(TDX_BASE, "/tdx/bridge/owner", {
        "ownerId": "mock-terminal", "mode": "builtin",
        "bridgeBuildId": "mock-build", "bridgeArtifactSha256": "a"*64,
        "acquisitionProfile": "tdx.get_market_snapshot", "schemaVersion": 2})
    lease, epoch = owner["leaseToken"], owner["streamEpoch"]
    tdx_converge(lease, epoch, symbol)
    if args.pause:
        print(f"paused {args.pause}s ..."); time.sleep(args.pause)
    n = 0
    while args.frames == 0 or n < args.frames:
        frame_native = dict(native)
        if args.price_offset:
            frame_native["Now"] = str(float(native["Now"]) + args.price_offset * n)
        post(TDX_BASE, "/tdx/bridge/snapshot", {
            "leaseToken": lease, "streamEpoch": epoch,
            "symbol": symbol, "capturedAt": args.captured_at or now_rfc3339(),
            "native": frame_native})
        post(TDX_BASE, "/tdx/bridge/poll",   # heartbeat <10s
             {"leaseToken": lease, "streamEpoch": epoch, "appliedRevision": -1})
        n += 1; print(f"tdx frame {n} @ {now_rfc3339()}")
        time.sleep(1.0 / args.rate)

def drive_qmt(args):
    case = json.loads(QMT_FIXTURE.read_text())["cases"]["qmtOneEntry"]
    symbol = list(case["data"]["native"].keys())[0]   # 300502.SZ
    native = case["data"]["native"][symbol]
    owner = post(QMT_BASE, "/qmt/bridge/owner", {
        "ownerId": "mock-terminal", "bridgeBuildId": "mock-build",
        "bridgeArtifactSha256": "b"*64})
    lease, gen = owner["leaseToken"], owner["generation"]
    # subscription command poll/result (subscriptionId = success value)
    cmd = post(QMT_BASE, "/qmt/bridge/subscriptions/poll",
               {"ownerId": "mock-terminal", "leaseToken": lease, "generation": gen})
    c = cmd["command"]
    sub_id = 12   # arbitrary int; must match what snapshot sends
    post(QMT_BASE, "/qmt/bridge/subscriptions/result", {
        "ownerId": "mock-terminal", "leaseToken": lease, "generation": gen,
        "callSequence": c["callSequence"], "success": sub_id})
    n = 0
    while args.frames == 0 or n < args.frames:
        post(QMT_BASE, "/qmt/bridge/subscriptions/snapshot", {
            "ownerId": "mock-terminal", "leaseToken": lease, "generation": gen,
            "subscriptionId": sub_id, "capturedAt": args.captured_at or now_rfc3339(),
            "native": {symbol: native}})
        n += 1; print(f"qmt frame {n} @ {now_rfc3339()}")
        time.sleep(1.0 / args.rate)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["tdx", "qmt"], required=True)
    ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--frames", type=int, default=0)
    ap.add_argument("--pause", type=float, default=0)
    ap.add_argument("--price-offset", type=float, default=0)
    ap.add_argument("--captured-at", default=None)
    args = ap.parse_args()
    (drive_tdx if args.source == "tdx" else drive_qmt)(args)

if __name__ == "__main__":
    main()
```

### 3.6 `mock-verify.sh`（全链路验证）

```bash
#!/usr/bin/env bash
# Full-chain verification: backend sealed grows, exporter reflects the chain.
set -euo pipefail
EXPORTER="http://127.0.0.1:9109/metrics"
CANDLES="http://127.0.0.1:8001/internal/realtime/candles/status"

echo "==> exporter reachable"; curl -fsS "$EXPORTER" >/dev/null
echo "==> backend candle health"
curl -fsS "$CANDLES" | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
print(f\"  mode={d['mode']} status={d['status']} sealed={d['candle']['sealedTotal']}\")
assert d['mode'] == 'shadow'
"
echo "==> sealed grows over 15s"
S1=$(curl -fsS "$CANDLES" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['candle']['sealedTotal'])")
sleep 15
S2=$(curl -fsS "$CANDLES" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['candle']['sealedTotal'])")
echo "  sealed $S1 -> $S2"
[ "$S2" -gt "$S1" ] || { echo "FAIL: sealed did not grow"; exit 1; }
echo "==> exporter candle metrics"
curl -fsS "$EXPORTER" | grep -E "mist_realtime_candle_(sealed_total|discard_total)" | head -5
echo "OK"
```

### 3.7 `README.md`（使用说明）

```
# Mock 环境（Phase 2）
前置：docker / uv（本仓）/ pnpm（mist 仓）/ go（mist-monitoring 仓）
启动：bash tools/mock-env/run-mock.sh    # redis 容器 + 三仓进程 + 等健康
注入：python3 tools/mock-env/mock-drive.py --source tdx --frames 5
      python3 tools/mock-env/mock-drive.py --source qmt --frames 5
验证：bash tools/mock-env/mock-verify.sh # sealed 增长 + exporter 指标
调试：日志 tools/mock-env/.mock-pids/*.log；三仓均可热重载/断点
清理：bash tools/mock-env/stop-mock.sh
```

---

## 4. 落地步骤

1. mist-datasource 仓建分支 `feat/mock-env`（先确认基准：master 最新 + 已有未合并分支不冲突）
2. 写 7 个新文件（tools/mock-env/）
3. 本机实测跑通：
   - `bash tools/mock-env/run-mock.sh`（redis 容器 + 三仓进程 + 等健康）
   - `python3 tools/mock-env/mock-drive.py --source tdx --frames 5`
   - `curl 127.0.0.1:8001/internal/realtime/candles/status`（sealed 增长）
   - `bash tools/mock-env/mock-verify.sh`（链路断言）
   - `python3 tools/mock-env/mock-drive.py --source qmt --frames 5`（双源）
   - 暂停注入 → sealed 停滞 → 恢复 → 自愈
4. commit + push + 合并 master + 清理
5. tasks.md 勾选 3.1-3.6（tasks 需补充 mock-drive 双源/注入器/归属 datasource 仓描述）

## 5. 风险与注意（落地时逐一核实）

| 风险 | 应对 |
|---|---|
| backend 是否自动 sync_subscriptions（TDX desired 来源）| 落地实测 backend WS 连接后 datasource 是否收到 sync；若无则注入器补 WS 客户端 |
| QMT subscriptionId 来源 | mock-drive 里固定 `sub_id=12`，需与 poll/result 回传一致；落地实测 |
| datasource 两进程入口模块名 | 按 qmt 先例 `uvicorn qmt.main:app`；tdx 落地对照仓结构确认 |
| monitoring cmd 入口与 `-config` flag | 落地对照 mist-monitoring 仓实际结构 |
| backend dev script 名（start:dev/start:debug）| 落地对照 package.json 确认；debug 供断点 |
| datasource 仓已有未合并分支（ratchet 等）| 落地前确认基准分支与状态，不污染在途工作 |
| 端口冲突（6379/8001/9001/9002/9109）| run-mock.sh 启动前检查并提示 |
| nohup 进程清理残留 | stop-mock.sh 按 pidfile 杀；重复 run 前先 stop |
| redis 镜像本地缺失 | run-mock.sh 自动 `docker pull`（docker run 会拉）|

## 6. 边界（明确不做）

- 不跑 prometheus（curl exporter /metrics 验证）
- 不做镜像 build、不做 compose、不碰 mist-deploy
- **mist/package.json 不加 mock scripts**（启动入口在 datasource 仓）
- 指标断言矩阵待指标梳理后扩展（本轮链路级）
- 不做 signal shadow（需 mysql）
- 不改 backend/datasource/exporter 代码（纯编排 + 注入器）
- 测试数据只用真实 fixture（只读引用），capturedAt 动态生成
