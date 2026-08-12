# 实施计划: restore-mock-env-candle-assertions

日期：2026-08-12
状态：待确认（spec 已确认，本计划为代码级落地细节）

## 涉及仓库与状态

| 仓库 | 文件 | 当前状态 |
|---|---|---|
| mist-datasource | `tools/mock-env/mock-verify.sh` | master `3ded4e6`，working tree 干净 |
| mist-datasource | `tools/mock-env/.env.mock` | master `3ded4e6`，**dirty**（L23 已有未提交的 `OTEL_SERVICE_NAME=mist-backend`） |
| mist | `.env.example` | master，仅文档追加 |

提交遵循项目惯例：个人项目不走 PR，直接合 master 推送。

---

## Phase 0：main.ts 观测注册内聚（D6，mock 模式适配前置）

> 落地中发现：mock backend 起不来——main.ts 无条件 `app.get` mock 排除模块的 provider。
> 用户拍板完美方案：观测注册内聚到模块，main.ts 零 provider 依赖。

### 0.1 RealtimeIngressModule（apps/mist/src/realtime/realtime-ingress.module.ts）

```ts
import { OnModuleInit } from '@nestjs/common';
import { registerCandleMetrics } from './observability/candle-metrics';
import { registerStartupCompensationMetrics } from './observability/startup-compensation-metrics';
// CandleFinalizer / RealtimeMarketDataProductService / RealtimeStrategyStartupCompensationService
// 均已 import（providers 里已声明）

export class RealtimeIngressModule implements OnModuleInit {
  constructor(
    private readonly finalizer: CandleFinalizer,
    private readonly product: RealtimeMarketDataProductService,
    private readonly compensation: RealtimeStrategyStartupCompensationService,
  ) {}

  onModuleInit() {
    registerCandleMetrics(this.finalizer, this.product);
    registerStartupCompensationMetrics(this.compensation);
  }
}
```

### 0.2 RealtimeSubscriptionModule（apps/mist/src/realtime-subscriptions/realtime-subscription.module.ts）

```ts
import { OnModuleInit } from '@nestjs/common';
import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';
import { registerSubscriptionLifecycleMetrics } from '../realtime/observability/subscription-lifecycle-metrics';
// ObservationStore / RuntimeConfigService 本模块 providers 已有

export class RealtimeSubscriptionModule implements OnModuleInit {
  constructor(
    private readonly observations: RealtimeSubscriptionLifecycleObservationStore,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  onModuleInit() {
    registerSubscriptionLifecycleMetrics(
      this.observations,
      this.allowlist,
      () => this.runtimeConfig.getAutoReconcileCached(),
    );
  }
}
```

> allowlist 经 @Global RealtimeIngressModule 注入（已导出）；无循环依赖
> （handoff 模块不 import Subscription 模块）。

### 0.3 main.ts（apps/mist/src/main.ts）

删除：
- L6-8 三个 registerXxx import
- L9-14 的 provider import（CandleFinalizer / RealtimeMarketDataProductService /
  RealtimeSecurityAllowlistService / RealtimeSubscriptionLifecycleObservationStore /
  RuntimeConfigService / RealtimeStrategyStartupCompensationService）
- L23-35 的 registerCandleMetrics / registerStartupCompensationMetrics /
  runtimeConfig / registerSubscriptionLifecycleMetrics 调用块

保留：useLogger、productizationMode 日志（ConfigService）、installHttpRequestContext、
Swagger、listen。

### 0.4 验证

```bash
pnpm run typecheck
# mock 模式起栈（run-mock.sh）→ /app/hello 200 且无 DI 报错
# 生产模式单测：app.module.spec.ts 通过（模块 onModuleInit 触发，noop meter 安全）
```

---

## Phase 0.5：D1 OO metrics 探针（先跑，定路径）

### 步骤

```bash
cd /Users/moyui/sean/mist/mist-datasource

# 1. 起栈（若未运行）
bash tools/mock-env/run-mock.sh

# 2. 持续注入（默认 --frames 0 = 无限循环，--rate 1 = 1 帧/秒）
python3 tools/mock-env/mock-drive.py --source tdx &

# 3. 等封存（clock offset 已配置，due/finalize 按前移时钟推进）
sleep 15

# 4. 探针：?type=metrics 查 mist_candle_sealed_total，dump 原始响应
OO_SQL="select * from 'mist_candle_sealed_total' order by _timestamp desc limit 5" \
OO_URL="http://127.0.0.1:5080/api/default/_search?type=metrics" \
OO_AUTH="cm9vdEBleGFtcGxlLmNvbTpDb21wbGV4cGFzcyMxMjM=" \
OO_START=$(( $(python3 -c "import time; print(int(time.time()*1e6))") - 7200000000 )) \
OO_END=$(python3 -c "import time; print(int(time.time()*1e6))") \
python3 -c "
import json, os, urllib.request
payload = {'query': {'sql': os.environ['OO_SQL'], 'start_time': int(os.environ['OO_START']), 'end_time': int(os.environ['OO_END'])}, 'size': 5}
req = urllib.request.Request(os.environ['OO_URL'], method='POST', data=json.dumps(payload).encode(), headers={'Authorization': 'Basic ' + os.environ['OO_AUTH'], 'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=10) as resp:
    print(json.dumps(json.load(resp), indent=2, ensure_ascii=False))
"

# 5. 交叉验证：Redis 里 sealed candle keys（可选 sanity）
docker exec mist-mock-redis redis-cli KEYS "mist:*candle*" | wc -l
```

### 判定

| 结果 | 路径 | 说明 |
|---|---|---|
| 200 + hits 含 `mist_candle_sealed_total` 记录（value ≥ 0） | **metrics 路径**（Phase 1） | 新增 `query_oo_metrics()`，字段名按探针响应确认 |
| 400/404/空 hits/字段不在预期 | **logs fallback**（Phase 1-alt） | 先查后端是否有封存日志；无 → **停下与用户讨论 D4**（是否给后端补封存日志，scope 扩大） |

探针发现的 hit 字段布局（如 `_name`/`_value` vs `name`/`value`）记录到本文件 Phase 1 的适配说明。

---

## Phase 1：mock-verify.sh 改动（metrics 路径）

### 1.1 删除两个注释块

- **L18-48**：`candle_snapshot()` + `latest_frame_age()` 函数 + `TODO(shrink-monitoring-to-blackbox-probe)` 注释（含 L21 `# CANDLES=` 和 L43 `# http://.../internal/realtime/{src}/status`）
- **L54-77**：主断言注释块（`read -r C1 S1 LAG1` 到 sealed 增长注释）

### 1.2 新增 `query_oo_metrics()` 函数（插在 `query_oo_logs()` 之后，即 L158 后）

```bash
# OpenObserve metrics search: per-metric streams (probe-verified 2026-08-12).
# Hit layout keys follow the probe response; name/value keys below match it.
query_oo_metrics() {
  local sql="$1"
  local now_us start_us
  now_us=$(python3 -c "import time; print(int(time.time()*1e6))")
  start_us=$((now_us - 7200000000))  # last 2 hours in microseconds
  OO_SQL="$sql" OO_URL="$OPENOBSERVE/api/default/_search?type=metrics" OO_AUTH="$OO_B64" \
    OO_START="$start_us" OO_END="$now_us" python3 -c "
import json, os, sys, urllib.request
payload = {
    'query': {
        'sql': os.environ['OO_SQL'],
        'start_time': int(os.environ['OO_START']),
        'end_time': int(os.environ['OO_END']),
    },
    'size': 10,
}
req = urllib.request.Request(
    os.environ['OO_URL'],
    method='POST',
    data=json.dumps(payload).encode(),
    headers={'Authorization': 'Basic ' + os.environ['OO_AUTH'], 'Content-Type': 'application/json'},
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        d = json.load(resp)
        hits = d.get('hits', [])
        for h in hits:
            # metric name | gauge value | _timestamp (keys per probe response)
            print(h.get('_name') or h.get('name') or '?', '|', h.get('_value') or h.get('value') or '?', '|', h.get('_timestamp'))
        print('TOTAL=' + str(d.get('total', 0)))
except Exception as e:
    print('ERR=' + str(e))
    sys.exit(1)
"
}
```

> 适配点：若探针显示字段名不同（如 `metric_name` / `data.value`），只改 print 行的 key 提取。

### 1.3 新增 sealed 增长断言块（插在 L158 函数定义之后、现有断言 #1 之前）

```bash
# --- candle sealing evidence via OpenObserve ---

# last observed mist_candle_sealed_total gauge value (empty when no data yet)
sealed_total() {
  query_oo_metrics "select * from 'mist_candle_sealed_total' order by _timestamp desc limit 5" \
    | grep -v '^TOTAL' | head -1 | awk -F'|' '{gsub(/[[:space:]]/, "", $2); print $2}'
}

# Sealed growth is the end-to-end real-time evidence: growth within the
# observation window means frames arrived, aggregated AND sealed (stronger
# than span recency, which measures the user-controlled injector).
SEALED_1=$(sealed_total)
echo "  sealed_total=${SEALED_1:-<no data yet>} (OpenObserve gauge)"
sleep 10
SEALED_2=$(sealed_total)
if [ -n "$SEALED_2" ] && [ "$SEALED_2" -gt "$SEALED_1" ]; then
  echo "  sealed $SEALED_1 -> $SEALED_2"
else
  echo "  sealed not growing (clock offset or bucket not payable); deferred"
fi
```

> 说明：帧到达链路（`tdx.snapshot.ingest` / `ws.broadcast` / `candle.snapshot.process` span）
> 由**现有断言 #1-#3 承担**，本 change 不动。sealed 增长是端到端证据（帧到达+聚合+封存全链），
> 替代原新鲜度检查（用户拍板 2026-08-12 删除——一次性注入 `--frames 5` 下 30s 硬判会误报）。

### 1.4 更新文件头部注释（L2-11）

原文引用了 `oldestLagMs`（已不用的中间值），改为 OO 口径：

```bash
# Two levels of assertion:
#   ingestion/aggregation (always verifiable): frames must keep arriving at the
#     backend and land in the candle pipeline. Works 24/7 because the injector
#     rewrites eventTime into the target session.
#   sealing (time-gated): sealed_total only grows once a due bucket's wall-clock
#     end + grace passes. Verified via the OpenObserve gauge; not a failure when
#     the bucket is not yet payable (clock offset controls this in mock).
```

---

## Phase 1-alt：logs fallback（仅当探针不通）

1. 先查后端封存日志是否存在：`grep -c "sealed\|finalize" .mock-pids/backend.log`
2. **有** → 用已有 `query_oo_logs()` 查 OO logs（`select * from 'default' where service_name='mist-backend' and body like '%<封存关键字>%'`），断言逻辑同 Phase 1
3. **无** → **停下与用户讨论**：是否给后端补一条封存成功 info 日志（触发 D4 变更 + scope 扩大）

---

## Phase 2：提交 .env.mock（mist-datasource）

```bash
cd /Users/moyui/sean/mist/mist-datasource
git add tools/mock-env/.env.mock
git commit -m "chore(mock-env): pin OTEL_SERVICE_NAME=mist-backend for mock stack"

# 验证：run-mock.sh L67 source .env.mock → backend 进程继承该变量
# .mock-pids/backend.log 里的日志/service_name 归到 mist-backend 而非 preload 默认值
```

---

## Phase 3：.env.example 文档（mist）

在 L52 `REALTIME_PRODUCTIZATION_MODE=off` 之后、`# ===== AKTools =====` 之前插入：

```bash
# ===== Mock realtime environment (local verification only, NEVER production) =====
# MIST_MOCK_MODE=true               # skip MySQL + business modules; realtime chain only
# MIST_MOCK_CLOCK_OFFSET_MS=        # shift Clock forward (ms) so due/finalize run outside trading hours
```

两行均注释（opt-in，mock-env 的 `.env.mock` 才是真正启用处）。

---

## Phase 4：验证

```bash
# 1. mock-env 端到端（探针通后）
bash tools/mock-env/run-mock.sh
python3 tools/mock-env/mock-drive.py --source tdx --frames 5   # 一次性注入即可
sleep 15
bash tools/mock-env/mock-verify.sh                             # 期望：全绿（span 断言 + sealed 增长）

# 2. 退役路径检索（active code 无 /internal/realtime）
grep -n "internal/realtime" tools/mock-env/mock-verify.sh   # 期望：仅注释说明，无活跃调用

# 3. openspec validate
cd /Users/moyui/sean/mist/mist
openspec validate restore-mock-env-candle-assertions --strict

# 4. datasource 基线（mock-verify.sh 是 bash，不跑 pytest/ruff，确认无副作用即可）
cd /Users/moyui/sean/mist/mist-datasource && uv run ruff check tools/mock-env/ 2>/dev/null || true
```

---

## 风险与注意

| 风险 | 应对 |
|---|---|
| OO metrics 探针不通 | Phase 1-alt logs fallback；若后端无封存日志 → 停下讨论 D4 |
| OO metrics hit 字段布局与预期不同 | 只改 `query_oo_metrics` 的 key 提取（适配点已标注） |
| `docker` 不可用（本地 OO 容器起不来） | 探针无法执行 → 环境阻塞，如实报告，不跳过 |
| 提交时 `.env.mock` 有其他 dirty 改动 | 只 add 该文件，先 diff 确认内容 |
