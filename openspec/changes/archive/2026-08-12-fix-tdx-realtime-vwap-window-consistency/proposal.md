# Proposal — TDX 实时 vwap 一致性出界修复（fix-tdx-realtime-vwap-window-consistency）

> 状态：**Confirmed（2026-08-10 owner 逐条确认）**——修复方向 A + B + C2b + E 定案。
> 下一步：第 2 步（代码级实施计划），确认后再落地。
> 证据：`evidence/2026-08-10-vwap-consistency-verification.md` + `evidence/vwap-window-repro.ts`（可复现）。

---

## 一、问题定义

`read-windows-realtime-candle-closed`（mist-deploy 只读 operator workflow）对当日已封存 1m 桶做
vwap 一致性检查（隐含成交均价 `vwap = a/v` 必须落在桶 `[low, high]` 内），2026-08-10 首查发现系统性出界：

| 源/标的 | 桶数 | 出界 | 占比 | 偏差幅度（对价格） |
|---|---|---|---|---|
| tdx:1 (600519.SH) | 121 | **36** | **30.5%** | 1.36-7.49 元（0.10-0.55%，~1350 元股价） |
| tdx:10 (300059.SZ) | 121 | 10 | 8.5% | 0.001-0.008 元（0.0005-0.04%，~20 元股价） |
| qmt:4 (300502.SZ) | 208 | 11 | ~5% | 0.003-0.3 元（较小） |

- 复发性：08-07 11:14 桶（vwap 低 1.66 元，当时归"终端侧量额不一致"）即同类；今日 600519 复发。
- 影响：600519 的 vwap 类策略评估每 ~3.3 桶有 1 个用错均价（若策略直接消费 vwap 判断）。

## 二、根因验证结论（2026-08-10，evidence 见上）

**量额数据正确；出界是 vwap 检查的前提在 TDX 3s 采集下不成立。**

1. **排除数值精度问题**：bridge 原样透传（无任何换算）、converter 纯 bigint 精确缩放（单位 profile
   手×100/万元×10000 有 08-03 生产样本钉死）、aggregator 全程 Decimal8 精确减法——全链路找不到
   缩放/舍入/单位错误；若单位错偏差会是 100×/10000×，非 0.1-0.55%。
2. **检查前提失效（M1，主因）**：桶 `[low, high]` 是 ~20 个 3s 采样点的 last-price min/max（采样带），
   而 vwap 是桶内全部成交的均价。TDX 的 `eventTime` = bridge 采集墙钟（秒精度）→ 桶归属按采集时刻
   截断。当桶内出现**落在采样间隙的瞬变价格尖峰**（真实市场常态），正确的 vwap 也会落在采样带外。
   复现实验（真实聚合器+converter，seed=20260810）：精确量额 + 瞬变尖峰 → 16.9% 出界，sealed vwap
   与真实 vwap 仅差 0.002-0.006%（量额零损坏），"真实 vwap 在带外"与出界桶完全重合。
3. **QMT 对照佐证**：QMT `eventTime` = 市场业务时间（timetag）+ tick 级推送 → 归属准确、采样带≈真实带
   → 仅 ~5%（残余来自有界队列丢帧的边界窗口错位）。
4. **遗留真缺陷（M2，未在生产触发）**：datasource contract 允许 Volume/Amount 缺席仍放行
   （`contract.py:35,195-196`），聚合器 volume/amount 窗口**逐字段独立推进**——某帧缺一个字段，
   v/a 窗口分叉（相差一帧 = 3s 成交）。实验：2% 缺字段 → 桶边界触发时偏差达 **42.9%**（≈帧权重×价格）。
   生产偏差 ≤0.55% 证明今日未触发，但这是无日志可见性的定时炸弹。
5. **舍入假说排除**：整数手舍入复现速率 ~79%（生产 30.5%），且 300059 实测偏差超"1 手界"6×。

## 三、修复方向（**待 owner 逐条确认，未确认前不改代码**）

### A. 检查侧异常分类（推荐纳入，主修复）

vwap 检查从"二元判定"改为"异常分类"，把 36 桶归入"采样噪声/归属错位"类，真异常单独计数：

- **采样噪声容差**：偏差 ≤ 阈值（如 `max(0.6% × close, 3 × (h−l))`——推导见 design §A）→ 归
  `sampling_noise`，不视为缺陷；
- **真异常判据**：v/a 为 null 但价格存在、`|偏差| > 阈值`、counter reset、方向连续单边——归
  `quantity_anomaly`，进入 `capture-realtime-provider-anomalies` 已定义的捕获边界（quantity 契约
  偏差：missing-field/scale/range/counter-jump）；
- 验收标准改写：复跑后 36 桶应全部归 `sampling_noise`（或全部归因并如实记录残余），真异常计数趋近 0。
- 影响面：mist-deploy workflow（operator 工具）+ 文档；不动 wire/契约/数据。

### B. canonical 窗口一致性（推荐纳入，M2 修复）

- 聚合器对"缺量额字段的帧"改为**双字段保持**（价格照常更新、量额都不推进，视为价格帧）→ v/a 窗口
  恒来自同一帧集，窗口分叉不可能发生；
- 缺字段帧计数/日志（info + warn 判断点，带 trace_id）——补观测盲区；
- 影响面：mist 仓 `open-candle-aggregator.ts`（canonical 层），**无 wire 契约变化**；单测补
  缺字段/部分缺字段边界用例。

### C. bridge 入队异步发（**owner 提议方向，推荐纳入**，需文档验证）

现状痛点（"点少"的直接来源）：`subscribe_hq` 回调只置 dirty（`on_quote_update` 只取 `Code`）、
worker 每 3s 轮询拉快照——帧密度 = 3s × dirty 门控；叠加 dirty 队列上限（`DIRTY_QUEUE_MAX=200`）
与 **POST 失败即永久丢弃**（`mist_tdx_realtime_bridge.py:447-448`），每分钟采样点远少于 20。
采样带不完整 → vwap 出带假阳性。

**C2（事件驱动拉快照，owner 提议方向，已定案）**：帧密度从"3s 定时轮询"升级为"事件驱动"。
**文档已验证**（`tdxquant-live-datasource-smoke.md:223-229`，引用 TDX 官方 help 文档
`mindoc-1h1104d65vr68`）：`subscribe_hq` 回调 payload 仅 `{Code, ErrorId}`，**不含行情数据** →
**C2a（回调数据直接入队，QMT 同构）不可行**；定案 **C2b 纯事件驱动**：回调置 dirty（不变）→
通知 worker → **立即**拉 `get_market_snapshot`（内容权威来源）→ POST。**无兜底轮询**
（owner 拍板：无行情即无帧）；**POST 失败重试**（失败不清 dirty，重试 = 重新拉最新——latest-state
语义下中间帧丢失无影响）。回调频率无需定标，帧密度随行情活跃度自调节。约束：回调线程仍只置
dirty（不破 C0.1 不变式）；拉取在独立线程；dirty 集合天然合并并发触发 + 防抖最小间隔
（200-500ms）；wire 契约不变；backend `duplicate_or_late` 去重已存在。实施前 HIL 加**真实快照
字段抓帧观测**（顺带钉死量额 profile：Volume 整数/小数形态）。

**E（socket 持久连接直推，owner 拍板方向，推荐纳入）**：TDX/QMT bridge 均**取消业务数据队列**
（内存压力不放在终端进程内：QMT 现状队列缓存 4MB 全在终端内存），并**改用持久 TCP 连接直推**
（解决 urllib 每帧新建连接的耗时大头）。形态：回调/tick 到 → 立即拉（TDX `get_market_snapshot`
权威来源）→ 立即序列化 → **写持久 TCP 连接**（stdlib `socket` + 4 字节长度前缀 JSON 帧——TDX
bridge 为 stdlib-only，Python 3.7 + tqcenter，不可装第三方库，stdlib 完全可行）→ gateway 校验 →
WS 广播（现有链路）。**无业务队列**：数据写出去即释放，剩余背压只有 OS socket 缓冲（写满丢帧 +
计数，仅 gateway 失联级触发）。断连 → 重连后重新拉最新再发（latest-state，中间帧丢失无影响）。
gateway 侧 asyncio 起 TCP 接收端点（连接建立首帧注册，带 leaseToken/streamEpoch 连接级身份），
复用现有校验/广播栈。**前置验证（HIL）**：① TDX 回调线程内直接拉 `get_market_snapshot` 是否
阻塞终端行情线程（C0.1"回调无 SDK/HTTP"不变式是否解冻）；若阻塞，保留最小符号集合（KB 级）
做线程交接；② 吞吐实测（回调节奏密度 + 发送延迟/写满计数），量化 socket 收益与帧率上限。

约束（设计见 design §C2/E）：回调线程只做锁内最小操作（TDX 置 dirty / QMT 单槽覆盖，不破
"回调无 SDK/HTTP"不变式，除非 HIL 证明回调线程可安全拉取）；wire 帧内容不变（schema-v2 native
map、字段校验不变），传输层从 HTTP POST 换为持久 TCP（gateway 新端点 + 四仓 fixture/契约同步）；
backend 侧 `duplicate_or_late` 去重已存在；HIL 验证终端负载。

### D. contract 量额字段必填化（可选，**必讨论**）

- TDX realtime 帧 Volume/Amount 改必填（wire 契约变更 + 四仓 fixture sha256 同步 + datasource 验证器
  收紧）——把 M2 从源头掐断；B 已在本仓层面兜底，D 是跨仓加固，可独立排期。

### 推荐基线

**A + B + C2b + E 纳入本次**（A 是检查语义、B 是窗口一致性保障、C2b 是 TDX 帧密度提升、E 是
TDX/QMT 传输统一为持久 TCP 直推——互相正交）。C1（轮询 3s→1s）作 C2b 不可行时的轻量备选；
D 暂缓。修复后正常路径量额字节级不变（C2b/E 不改变字段值，只改变帧节奏与传输方式）。

## 四、验收标准（改写后）

1. 复跑 `read-windows-realtime-candle-closed`（tdx:1/tdx:10，20260810）：36 桶全部归
   `sampling_noise`（或逐桶归因记录），`quantity_anomaly` = 0；
2. B 的单测：缺字段帧注入下 v/a 窗口不再分叉（窗口误差 = 0），正常路径 sealed 记录字节级不变；
3. 生产复跑分布不变（B 不改正常路径数据）——仅分类标签变化。

## 五、范围与约束

- 本 change 只做 mist 仓（A 的工具在 mist-deploy，B 在 mist）；C/D 涉及 datasource 仓需另行确认。
- 分支：`feat/fix-tdx-quantity-precision`（mist，从 master 建 worktree）。
- 治理指南：量/额口径、缩放经 08-03 生产样本 + gate review 复核为正确（本节"必须停下来讨论"已以
  证据闭环）；本次变更不恢复任何退役字段/兼容别名。
- 生产：当前 productization=shadow / lifecycle=on / strategy=on；验证用只读 workflow，部署（如有）
  必传 productization=shadow。
