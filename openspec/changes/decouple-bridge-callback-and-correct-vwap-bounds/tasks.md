# Tasks — decouple-bridge-callback-and-correct-vwap-bounds

## A. TDX 桥回调解耦（mist-datasource 仓）

- [ ] A1. `mist_tdx_realtime_bridge.py`：新增模块级 `BRIDGE_QUEUE: deque[str](maxlen=1000)`
      （统一队列名；元素=code str）
- [ ] A2. `_make_subscription_callback`：回调只 `BRIDGE_QUEUE.append(code)` + `callback_count++`
      （删除回调内的 `get_quote` + `_push_snapshot` 调用——回调 thin，不调 SDK/不 send）
- [ ] A3. 新增 `_drain_bridge_queue(sender, owner, counters) -> int`：循环 `popleft` →
      `get_market_snapshot` + `_push_snapshot`，返回 drained count；`run_bridge` 主循环
      队列优先调用 + 队列空时 poll datasource（现有逻辑）
- [ ] A4. 主循环 reconnect：`register_frame` 每次用 owner 当前 lease 重建（保留 `e686b25` 修复）
- [ ] A5. 删除 `_make_subscription_callback` 内残留的 sender/counters 引用（回调不再直接 send）
- [ ] A6. `BRIDGE_BUILD_ID` bump v2.1 → v3.0（标识新架构；改进项一并落地）

## B. QMT 桥回调解耦（mist-datasource 仓）

- [ ] B1. `mist_qmt_realtime_bridge.py`：新增模块级 `BRIDGE_QUEUE: deque[dict](maxlen=1000)`
      （统一队列名；元素=payload dict——与 TDX 对齐命名，类型不同）
- [ ] B2. `_make_subscription_callback`：回调只 `_prepare_callback_native` + 组装 payload +
      `BRIDGE_QUEUE.append(payload)` + `callback_count++`（删除回调内的 `_push_snapshot`/`sender.send`）
- [ ] B3. 新增 `_drain_bridge_queue(sender, counters) -> int`：循环 `popleft` → `_push_snapshot`（数据已在 payload），
      返回 drained count；`mist_qmt_realtime_bridge_tick`（或主循环）队列优先消费 + reconnect/observability
- [ ] B4. 保留 `bounded_copy` 在回调内（内存操作，thin）；仅移除 send
- [ ] B5. `BRIDGE_BUILD_ID` bump v2.0 → v3.0（QMT 同步）

## C. guardrail 测试 + 函数对齐（mist-datasource 仓）

- [ ] C1. `test_terminal_bridge.py`：TDX 桥断言回调内不含 `get_market_snapshot` / `get_quote` / `_push_snapshot`
- [ ] C2. `test_terminal_bridge.py`：QMT 桥断言回调内不含 `_push_snapshot` / `sender.send`
- [ ] C3. **函数对齐断言**：TDX/QMT 两桥的 `BRIDGE_QUEUE` / `_drain_bridge_queue` /
      `_make_subscription_callback` / `_push_snapshot` 符号名一致（延续 77e5cf7 对齐基线）
- [ ] C4. 队列单测：deque maxlen 溢出（append beyond maxlen → 旧元素丢弃）+ popleft 顺序（TDX+QMT 各一）
- [ ] C5. `ruff check . && uv run pytest`（非 live）全绿

## D. vwap 反向修正（mist 仓）

- [ ] D1. `open-candle-aggregator.ts`：seal 路径（toSealedCandle 或等效输出处）加 vwap bound correction：
      `if (volume>0 && amount>0) { vwap=amount/volume; high=Math.max(high,vwap); low=Math.min(low,vwap); }`
- [ ] D2. `open-candle-aggregator.spec.ts`：单测 4 用例：
      - vwap > high → high 修正为 vwap
      - vwap < low → low 修正为 vwap
      - vwap 在 [low,high] 内 → 不变
      - volume=0 或 amount=0 → 不修正（vwap 无意义）
- [ ] D3. 现有回归：正常帧流 sealed 记录不变（vwap 在范围内时不修正 = 无操作）
- [ ] D4. `npm run lint:check && npm run typecheck && TZ=UTC npm run test:ci`（mist 基线）

## E. deploy 仓（mist-deploy）

- [ ] E1. `update-windows-tdx-bridge-script.yml`：扩展支持 QMT 路径（加 `source` 输入 tdx|qmt，
      或新建 `update-windows-qmt-bridge-script.yml`）
- [ ] E2. test-workflow-config.ps1：断言更新（如新建 QMT workflow）

## F. 验证

- [ ] F1. mock-env 全链路：TDX/QMT 注入帧 → 队列消费 → sealed → vwap 修正（mock 回放）
- [ ] F2. 生产 HIL（TDX）：桥脚本更新 + 重启终端 → 观测帧 callback/fetch/send/droppedFrames
- [ ] F3. 生产 HIL（QMT）：桥脚本更新 + 重启终端 → 观测帧 + qmt.snapshot.ingest
- [ ] F4. 生产 HIL：vwap 检查复跑（read-candle-closed workflow）→ 出界率应大幅下降（修正后理论为 0）
- [ ] F5. `openspec validate decouple-bridge-callback-and-correct-vwap-bounds --strict`

## G. 提交（不合并 master，等验证后统一合 + 部署）

- [ ] G1. mist-datasource 分支提交推送（TDX + QMT 桥 + guardrail 测试）
- [ ] G2. mist 分支提交推送（vwap 修正 + 单测）
- [ ] G3. mist-deploy 分支提交推送（workflow 扩展）
- [ ] G4. 不合并 master（等 HIL 验证后统一合 + 部署）
