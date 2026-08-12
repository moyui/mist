# Tasks — decouple-bridge-callback-and-correct-vwap-bounds

## A. TDX 桥回调解耦（mist-datasource 仓）

- [x] A1. `mist_tdx_realtime_bridge.py`：新增模块级 `BRIDGE_QUEUE: deque[str](maxlen=1000)`
      （统一队列名；元素=code str）
- [x] A2. `_make_subscription_callback`：回调只 `BRIDGE_QUEUE.append(code)` + `callback_count++`
      （删除回调内的 `get_quote` + `_push_snapshot` 调用——回调 thin，不调 SDK/不 send）
- [x] A3. 新增 `_drain_bridge_queue(sender, owner, counters) -> int`：循环 `popleft` →
      `get_market_snapshot` + `_push_snapshot`，返回 drained count；`run_bridge` 主循环
      队列优先调用 + 队列空时 poll datasource（现有逻辑）
- [x] A4. 主循环 reconnect：`register_frame` 每次用 owner 当前 lease 重建（保留 `e686b25` 修复）
- [x] A5. 删除 `_make_subscription_callback` 内残留的 sender/counters 引用（回调不再直接 send）
- [x] A6. `BRIDGE_BUILD_ID` bump v2.1 → v3.0（标识新架构；改进项一并落地）

## B. QMT 桥回调解耦（mist-datasource 仓）

- [x] B1. `mist_qmt_realtime_bridge.py`：新增模块级 `BRIDGE_QUEUE: deque[dict](maxlen=1000)`
      （统一队列名；元素=payload dict——与 TDX 对齐命名，类型不同）
- [x] B2. `_make_subscription_callback`：回调只 `_prepare_callback_native` + 组装 payload +
      `BRIDGE_QUEUE.append(payload)` + `callback_count++`（删除回调内的 `_push_snapshot`/`sender.send`）
- [x] B3. 新增 `_drain_bridge_queue(sender, counters) -> int`：循环 `popleft` → `_push_snapshot`（数据已在 payload），
      返回 drained count；`mist_qmt_realtime_bridge_tick`（或主循环）队列优先消费 + reconnect/observability
- [x] B4. 保留 `bounded_copy` 在回调内（内存操作，thin）；仅移除 send
- [x] B5. `BRIDGE_BUILD_ID` bump v2.0 → v3.0（QMT 同步）

## C. guardrail 测试 + 函数对齐（mist-datasource 仓）

- [x] C1. `test_terminal_bridge.py`：TDX 桥断言回调内不含 `get_market_snapshot` / `get_quote` / `_push_snapshot`
- [x] C2. `test_terminal_bridge.py`：QMT 桥断言回调内不含 `_push_snapshot` / `sender.send`
- [x] C3. **函数对齐断言**：TDX/QMT 两桥的 `BRIDGE_QUEUE` / `_drain_bridge_queue` /
      `_make_subscription_callback` / `_push_snapshot` 符号名一致（延续 77e5cf7 对齐基线）
- [x] C4. 队列单测：deque maxlen 溢出（append beyond maxlen → 旧元素丢弃）+ popleft 顺序（TDX+QMT 各一）
- [x] C5. `ruff check . && uv run pytest`（非 live）全绿

## D. vwap 反向修正（mist 仓）

- [x] D1. `open-candle-aggregator.ts`：seal 路径（toSealedCandle 或等效输出处）加 vwap bound correction：
      `if (volume>0 && amount>0) { vwap=amount/volume; high=Math.max(high,vwap); low=Math.min(low,vwap); }`
- [x] D2. `open-candle-aggregator.spec.ts`：单测 4 用例：
      - vwap > high → high 修正为 vwap
      - vwap < low → low 修正为 vwap
      - vwap 在 [low,high] 内 → 不变
      - volume=0 或 amount=0 → 不修正（vwap 无意义）
- [x] D3. 现有回归：正常帧流 sealed 记录不变（vwap 在范围内时不修正 = 无操作）
- [x] D4. `npm run lint:check && npm run typecheck && TZ=UTC npm run test:ci`（mist 基线）

## E. deploy 仓（mist-deploy）—— 被 SSH ops 通道取代（830152c）

- [x] E1. ~~`update-windows-tdx-bridge-script.yml` 扩展~~ → **被 SSH scp 替代**（830152c 退役
      workflow；runbook `docs/runbooks/windows-openssh-ops.md` 覆盖 scp + SHA 校验 + 重启）
- [x] E2. ~~test-workflow-config.ps1 断言~~ → N/A（workflow 退役）

## F. 验证

- [ ] F1. mock-env 全链路：TDX/QMT 注入帧 → 队列消费 → sealed → vwap 修正（mock 回放）
      （**未跑**——mock 环境待重整）
- [x] F2. 生产 HIL（TDX）：桥脚本更新 + 重启终端 → 观测帧 callback/fetch/send/droppedFrames
      （**08-12 10:52 验证通过**：终端重启加载 v3.0（stale lease 修复生效）→
      tcp registered v3.0 + TdxRealtimeClient ingest 恢复 + 观测帧 callback=90/fetch=90/
      fetch_none=0/send_dropped=0/droppedFrames=0/connected=true + candle tdx OK ×98 + sealed 增长）
- [x] F3. 生产 HIL（QMT）：桥脚本更新 + 重启终端 → 观测帧 + qmt.snapshot.ingest
      （**08-12 09:31 验证通过**：reset-journal + mode=builtin + 桥 v3.0 register →
      qmt.snapshot.ingest ×8 + candle qmt OK ×200 + subscriptions.ready=true）
- [ ] F4. 生产 HIL：vwap 检查复跑（read-candle-closed workflow）→ 出界率应大幅下降（修正后理论为 0）
      （**待 9:30 开盘**——今天数据积累后复跑）
- [x] F5. `openspec validate decouple-bridge-callback-and-correct-vwap-bounds --strict`

## G. 提交（不合并 master，等验证后统一合 + 部署）

- [x] G1. mist-datasource 分支提交推送（TDX + QMT 桥 + guardrail 测试）
- [x] G2. mist 分支提交推送（vwap 修正 + 单测）
- [x] G3. mist-deploy 分支提交推送（workflow 扩展）
- [x] G4. ~~不合并 master~~ → 实际已合并 master 并部署（08-11 31509011752 + 08-12 31535296889 ride-along）

---

## 08-12 项目质量审查结论（project-quality-governance-guide §12）

> 审查文档：`otel-whitebox-20260810/2026-08-12-deploy-verify-and-quality-review.md`

**结论：通过（0 高 / 0 中 / 4 低 findings）**

### Findings（4 低，待用户决策）

| ID | 严重度 | 位置 | 问题 | 建议 |
|---|---|---|---|---|
| F1-q | LOW | `open-candle-aggregator.ts:608-610` | VWAP clamp 用浮点 → sealed high/low 可能带 sub-cent 精度（如 1349.4286），与 MySQL DECIMAL(20,2) 不一致 | clamp 前 round：`Math.max(high, round(vwap*100)/100)`；影响低（策略按范围用 high/low） |
| F2-q | LOW | design §2.5 / specs delta | VWAP clamp 只作用实时 Redis sealed；历史 MySQL OHLC 保留原始采样带 → 同 bar 实时 high ≥ 历史 high | 文档化 clamp 的实时专属 scope |
| F3-q | LOW | `mist_tdx_realtime_bridge.py:432-441` | TDX 队列元素是 code（信号），drain 时取当前快照 → 同 code 连续 tick = 多次 fetch 同一快照 = 重复 send | 每轮 drain 去重（unique codes）；QMT 不受影响 |
| F4-q | LOW | `mist_tdx_realtime_bridge.py:421-422` | TDX 回调 except 静默吞错；QMT 用 _bounded_diagnostic → 观测不对称 | TDX 对齐 QMT 做 bounded 诊断 |

### 08-12 凌晨验证已确认（非交易时段）

- 部署 `31535296889` success（prod=71f0c66，migration 017 幂等）
- TDX 桥 v3.0 SHA exact 匹配；ingest 活（300059.SZ + 600519.SH）
- allowlist 非空（DB 声明式读，2 entries）
- datasource 日志入 OO（TDX 11440 条）；**QMT 侧缺口（P5 O2b）**
- OpenSSH enable ✅（sshd running、key-only、防火墙 TCP22 仅 LAN）
- jest 26/26 + pytest 15/15

### 待 9:30 开盘验证

- candle 封存持续增长（mist_candle_sealed_total）
- VWAP 出界复跑（修正后理论 0）—— 验 F1-q/F2-q 实际影响
- 观测帧 runtime：callback→fetch/send + droppedFrames=0 + fetch_none=0
- QMT 数据流恢复 + 日志入 OO（P5）
