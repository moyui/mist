# 交接提示词 — TDX 量额数据不一致修复（vwap 系统性出界）

> 来源：2026-08-10 主线程 vwap 检查工具首查发现（`read-windows-realtime-candle-closed`）。
> **本线程职责：定位并修复 TDX 累计量/额 delta 的数据精度问题（600519 28% 桶 vwap 出界）。**
> 先读：`mist/docs/project-quality-governance-guide.md`（**provider 数据语义属"必须停下来讨论"**）、
> `otel-whitebox-20260810/handoff-prompts-otel-observability-gaps.md`（缺口 #3 背景）、
> `otel-whitebox-20260810/evidence-2026-08-10-o1-o2a-live-test-passed.md`（今日生产状态）。
> **三步工作流**：先建 spec（proposal/design/tasks）→ 与 owner 逐条确认修复方向 →
> 再写实施计划 → 落地。**修复方向未确认前不得改代码**。

---

## 一、问题定义（2026-08-10 实测）

**vwap 一致性检查**（隐含成交均价必须落在桶 [low, high] 内）发现系统性异常：

| 源/标的 | 桶数 | 出界 | 真异常 | 偏差幅度 |
|---|---|---|---|---|
| **tdx:1 (600519.SH)** | 121 | 36 | **34（28%）** | **1.36-7.49 元**（~1350 元股价的 0.1-0.55%） |
| tdx:10 (300059.SZ) | 121 | 10 | ~10 | 0.001-0.03 元 |
| qmt:4 (300502.SZ) | 208 | 11 | ~9 | 0.003-0.3 元（较小） |

- 样例（600519）：vwap=1356.33 vs 区间 [1357.69, 1358.87]（低 1.36）；vwap=1361.11 vs
  [1357.44, 1357.60]（高 3.51）；最大偏差 7.49 元。
- **复发性**：08-07 的 11:14 桶（vwap 低 1.66 元）即同类；今日 600519 28% 复发——**系统性，
  非瞬时**。
- **影响**：600519 的 vwap 类策略评估每 ~3.5 个桶就有 1 个用错均价（偏差 0.1-0.55%）。

## 二、根因方向（嫌疑排序，需逐一验证）

1. **TDX bridge 累计量/额字段精度 + delta 计算**（mist-datasource 仓，
   `tdx/builtin_bridge/mist_tdx_realtime_bridge.py`）：量/额的 scale factor 处理或
   delta 基线（跨桶 cumulative 差异）的舍入/精度累积——0.1-0.55% 偏差像缩放/舍入在
   delta 中的系统性漂移。
2. **mist 侧 converter 缩放**（mist 仓 `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts`：
   `readTdxNativeQuantity(input.native, 'Volume', 100)` / `'Amount', 10_000`）——缩放系数
   与 bridge 实际字段的匹配、浮点精度。
3. **聚合 delta 语义**（mist 仓 `open-candle-aggregator.ts` 的 cumulative delta）——
   首个快照基线/断流后重建的 delta 污染（今日 TDX 上午 11:29:30 终端刚恢复，但异常
   遍布全下午，非恢复窗口特有）。
4. **对比 QMT（正常）**：QMT 的 amount/volume 精度（provider-float / decimal-text 路径）
   为何只有 5% 且偏差小——差异即线索。

## 三、调查路径建议

1. **复现与量化**：`read-windows-realtime-candle-closed` workflow（mist-deploy `e7c2983`，
   trading_day/source/security_id 三输入）随时复跑——修复前后 outOfRangeCount 对比即验收。
2. **mock 复现**：mist-datasource `tools/mock-env/`（或本地 synthetic 帧注入）——用真实
   TDX 帧样例（`tests/fixtures/tdx/live_market_snapshot_600519.json`）回放，观察 vwap 偏差
   是否在 delta 计算中复现。
3. **数据比对**：取一个出界桶（如 1786339740000：vwap 1356.33 vs [1357.69, 1358.87]）的
   前后快照 cumulative Volume/Amount 原始值，手工核算 delta 与 vwap——定位是 bridge 字段
   还是缩放/舍入。
4. **跨源对比**：同一时刻 QMT 300502 桶的 delta 精度路径对比（provider-float vs
   native-decimal-text）。

## 四、修复候选（spec 阶段与 owner 确认，勿自行定案）

- A. **bridge 侧**：修正 scale factor / 用更高精度字段 / delta 提供方式（影响 wire 契约——
  **必须 OpenSpec delta + 四仓 fixture sha256 同步**）。
- B. **mist converter 侧**：readTdxNativeQuantity 缩放/精度修正（不影响 wire，canonical 层修复）。
- C. **聚合语义**：delta 基线/舍入策略调整（涉及 candle 语义——**必须停下来讨论**）。
- 验收标准：修复后 tdx:1 outOfRangeCount 从 36 → 趋近 QMT 水平（≤5% 且无 >0.1% 偏差），
  或全部归因并如实记录残余。

## 五、约束

- **三步工作流**：spec（proposal 含根因验证证据）→ owner 确认修复方向 → 实施计划 → 落地。
  provider 数据语义（量/额口径、缩放）按治理指南属必讨论项。
- **分支**：涉及 mist 仓（converter）用 `feat/fix-tdx-quantity-precision` 从 master 建 worktree；
  涉及 mist-datasource 仓（bridge）用 `feat/fix-tdx-bridge-quantity` 从 master（`146d661` 系）
  建 worktree；两仓改动若契约联动需同批部署（bridge+backend 镜像）。
- **验证**：mock 复现 → 本地单测（converter/aggregator spec 补充边界用例）→ 生产部署后
  `read-windows-realtime-candle-closed` 复跑对比（修复前后 36 vs 期望值）。
- 相关：capture-realtime-provider-anomalies change（未实现）可承接本问题的异常采集规范；
  修复本身建议独立 change（命名如 `fix-tdx-quantity-delta-precision`）。
- 今日生产：shadow/lifecycle=on/strategy=on，双源实盘；修复部署时**必传 productization=shadow**。
