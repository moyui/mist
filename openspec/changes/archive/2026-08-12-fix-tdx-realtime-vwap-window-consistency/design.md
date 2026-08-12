# Design — vwap 一致性检查分类 + canonical 窗口一致性

> 对应 proposal §三 A/B（推荐基线）。C/D 为 owner 可选的独立方向，本文不做详细设计。

---

## A. 检查侧异常分类（mist-deploy `read-windows-realtime-candle-closed`）

### A.1 分类输出结构

`MIST_VWAP_CHECK` 摘要扩展（保持向后兼容，旧字段不变，新增分类计数）：

```
vwapClassification: {
  samplingNoise: 36,        // |dev| ≤ tolerance → 预期采样噪声
  quantityAnomaly: 0,       // v/a null-with-prices、|dev| > tolerance、counter reset 等
  skipped: 3                // 原 nullOrZeroVwap
}
outOfRange: [...]           // 每桶附 classification 标签（sampling_noise|quantity_anomaly）
```

### A.2 容差推导（TBD 细节，实施计划阶段定值）

出界偏差 = 未被采样的瞬变尖峰深度 × 尖峰量占比。两项都不能从 sealed 记录直接观测，用可观测代理：

- **代理 1（价格离散度）**：桶采样带宽度 `(h−l)` 的 k 倍。3s 采样下未采样尖峰深度可达带宽的数倍；
  生产 600519 出界桶偏差最大 0.55%（= 7.49 元），对应桶 `(h−l)` 普遍 ≤1.5 元 → `k≈5` 可覆盖。
- **代理 2（固定比例）**：`0.6% × close`（600519 最坏 0.55% + 余量；300059 最坏 0.042% 远小于）。
- **建议容差**：`tolerance = max(0.6% × close, 5 × (h−l))`——两个代理取大者，按桶自适应。

> 注意：容差是**检查语义**（什么算"可解释噪声"），不是数据修正——sealed v/a 保持不变。

### A.3 真异常判据（quantity_anomaly）

满足任一即 `quantity_anomaly`，需人工/后续捕获流程介入：

1. `v/a` 为 null 但该桶有价格（价格帧存在而量额缺失——M2 痕迹）；
2. `|偏差| > tolerance`（超出采样噪声物理上限，提示窗口错位/量额损坏）；
3. 连续 ≥3 桶同方向出界（单边系统性——排除随机尖峰，指向单位/缩放漂移）；
4. 出界桶的 v/a 与邻桶累计值不自洽（`cv/ca` 单调性破坏——counter reset 痕迹）。

### A.4 与 capture-realtime-provider-anomalies 的关系

该 change（未实现，dormant）已定义 quantity 契约偏差捕获边界（missing-field/type/grammar/scale/
range/counter-jump/accepted-profile）。本 change **不实现**其捕获流程，只把 `quantity_anomaly`
分类的输出格式对齐其边界词汇（`observed|not-observed` 语义），后续由该 change 承接采集。

---

## B. canonical 窗口一致性（mist `open-candle-aggregator.ts`）

### B.1 现状

`updateCandidate`/`openCandidate` 对 `cumulativeVolume` / `cumulativeAmount` **逐字段**调用
`applyQuantityUpdate`/`initializeQuantity`：某帧 `cumulativeVolume` 为 null（datasource contract 允许
Volume 缺席仍放行）时，volume 窗口冻结一帧而 amount 继续推进 → 桶 v/a 来自不同时间窗口 →
vwap = a/v 混算错误（实验：偏差可达 42.9%）。

### B.2 目标语义（价格帧规则）

**一帧量额字段部分/全部缺失时，按"价格帧"处理：价格（o/h/l/c）照常更新，v/a 窗口整体不推进
（双字段保持），直到下一帧两个字段都齐全。**

- 不引入 per-field 部分更新路径：`applyQuantityUpdate` 改为按"快照级量额可用性"门控；
- 缺失帧计数 + 日志：info（生命周期）+ warn（判断点，pinoTraceMixin 带 trace_id）——
  "指标必须配日志"（2026-08-10 用户反馈）；
- **正常路径零变化**：两字段齐全的帧行为与现在完全一致（sealed 记录字节级不变）；
- **行为边界**：桶的 v/a 窗口终点 = 最后一个双字段齐全帧 → 与价格 h/l 终点一致（同一帧集）——
  顺带消除"价格帧推进 h/l 而量额窗口冻结"的隐含错位（M1 的边界尾部贡献）。

### B.3 与 M1（采样带）的关系

B 修复 M2（窗口分叉），**不改变** M1（采样带漏尖峰 → 检查假阳性）——M1 由 A 的容差分类承接，
两者正交：B 保证"vwap 计算自正确窗口"，A 保证"检查判定不再误报可解释噪声"。

### B.4 单测用例（实施计划细化）

1. 正常帧流 sealed 记录与修复前字节级一致（回归基线）；
2. 帧缺 Volume（Amount 齐全）→ 该帧 v/a 都不推进，下一双字段帧恢复，窗口误差 = 0；
3. 帧缺 Amount（Volume 齐全）→ 同上；
4. 连续多帧缺量额 → 窗口保持，恢复后一次到位；
5. 桶边界帧缺字段 → 邻桶基线不受污染；
6. 缺字段帧计数/日志断言（warn 判断点 + trace_id 存在）。

---

## C2. bridge 入队异步发（owner 提议方向，mist-datasource）

### C2.1 现状痛点（为什么"点少"）

- `subscribe_hq` 回调 `on_quote_update` 只取 `Code` 置 dirty，数据丢弃（`mist_tdx_realtime_bridge.py:295-302`）
- worker 每 3.0s 轮询 dirty 符号拉快照 → 帧密度上限 0.33 Hz/符号
- `DIRTY_QUEUE_MAX=200` 上限：超限符号被静默丢弃（`:131-132`）
- **POST 失败即永久丢弃**（`:447-448`，"latest-state observations are never replayed"）
- 帧少 → 桶采样带窄 → vwap 出带假阳性（V2 实验：均匀 3s 已 16.9%，稀疏更高）

### C2.2 变体定案（文档已验证，2026-08-10）

`tdxquant-live-datasource-smoke.md:223-229`（引用 TDX 官方 help 文档 `mindoc-1h1104d65vr68`）：
`subscribe_hq` 回调 payload 仅 `{Code, ErrorId}`，**不含任何行情数据** → **C2a（回调数据直接入队）
不可行**，定案 **C2b：回调置 dirty（不变）→ 事件驱动处理**：

```
subscribe_hq 回调（行情线程）
  │ 锁内 mark_dirty（不变，数据本就只有 Code）
  ▼
drain/worker（独立线程）
  │ dirty 非空 → 立即 get_market_snapshot + POST（3s 定时改为事件驱动 + 防抖最小间隔）
  ▼
gateway → WS push
```

### C2.3 设计要点（更新）

1. **纯事件驱动 worker**：回调置 dirty + 通知（threading.Event/Condition）→ worker 唤醒后
   拉取 dirty 符号快照并 POST；无事件则阻塞等待——**无兜底轮询**（owner 拍板：无行情即无帧）；
   dirty 集合天然合并并发触发，加防抖最小间隔（200-500ms，参数化）防回调风暴下的拉取风暴；
2. **回调频率无需定标**（owner 拍板）：内容来源 = `get_market_snapshot`（权威快照），回调只是
   触发信号；实施前 HIL 加**真实快照字段抓帧观测**——当前遥测只记计数不落字段（metrics.py
   accepted/rejected/age；gateway 日志仅 symbol/schema；rejected 错误消息才带 `{value!r}`），
   帧字段形态（Volume 整数/小数）需抓帧钉死，顺带补强量额 profile；
3. **回调线程安全**：仍只置 dirty（不破 C0.1"回调无 SDK/HTTP"不变式）；
4. **事件语义**：`capturedAt = 拉取墙钟（秒级）`归属语义不变（回调无业务时间字段）；
   backend `duplicate_or_late` 去重已兜底；
5. **契约影响**：wire 不变（schema-v2 native map + contract.py 字段校验不变）；
   `ACQUISITION_PROFILE` 语义从"3s 周期轮询"改为"事件驱动拉取"需在 datasource 仓文档更新；
6. **验证**：HIL 抓帧观测（字段形态 + 帧数对比）→ mock-env 回放事件序列 → 生产复跑 vwap
   检查对比假阳性率。

### C2.4 预期收益与边界（诚实声明）

- 收益：帧密度从 ≤0.33 Hz 提升至回调节奏 → 采样带完整度大幅提升 → 假阳性率下降（量级待 HIL
  量化）；顺带消除 dirty 门控/200 上限导致的点缺失；
- 边界：**不归零**——任何采样都有间隙；M1 残余由 A 的容差分类承接；M2 由 B 兜底；
- 风险：TDX 终端回调节奏未实测（吞吐实测任务）；高频期拉取/发送积压需观测（积压计数）。

---

## E. socket 持久连接直推（owner 拍板方向，mist-datasource）

### E.1 现状问题

- QMT bridge 持 4MB 有界队列 + 8 条/tick 节流 + 驻留 >5s 丢弃（`mist_qmt_realtime_bridge.py:388-433`）
  ——缓冲与背压全压在终端内的 bridge；
- 两 bridge 均用 urllib **每帧新建 TCP 连接**（0.5-1ms/帧，loopback）——帧率上限 ~500 帧/s；
- POST 失败即丢且无观测。

### E.2 目标形态（持久 TCP 直推，无业务队列）

```
回调/tick 到
  │ TDX：置 dirty → 事件通知 → worker 拉 get_market_snapshot（或 HIL 证明回调线程可拉）
  │ QMT：锁内 latest[symbol] = bounded_copy(native)（O(1) 单槽覆盖，非队列）
  ▼
序列化 → 写持久 TCP 连接（stdlib socket + 4 字节大端长度前缀 + JSON 帧）
  │ 数据写出去即释放——无业务队列，剩余背压只有 OS socket 缓冲（写满丢帧 + 计数）
  ▼
datasource gateway（asyncio TCP 接收端点）
  │ 连接首帧注册（leaseToken/streamEpoch 连接级身份）→ 校验（复用现有逻辑）→ WS 广播
```

要点：
1. **帧格式**：`[uint32 BE length][JSON]`；JSON 结构沿用现有 snapshot body
   （owner 身份、symbol、capturedAt、native）——校验/广播栈复用，wire 内容不变；
2. **连接生命周期**：启动/重连时注册（复用现有 owner 语义）→ 断连 → 重连 → 重发最新
   （latest-state，中间帧丢失无影响）；写满/写失败 → 丢帧 + 计数（OS 缓冲极限，
   仅 gateway 失联级触发）；
3. **批量**：TDX 一轮 dirty 的多符号可打包一帧；QMT latest 多符号打包（现状即多符号 dict）——
   请求数降一个量级；
4. **回调线程不变式**：默认仍不破 C0.1（TDX 置 dirty / QMT 单槽覆盖）；**前置 HIL 验证**
   回调线程内直接拉 `get_market_snapshot` 是否阻塞终端行情线程——若不阻塞，TDX 可省事件线程
   交接（最小符号集合 KB 级单槽）；若阻塞，维持事件通知线程拉取。

### E.3 量化（为什么持久连接是关键）

| 环节 | urllib 新建连接（现状） | 持久 TCP（E） |
|---|---|---|
| TCP 连接建立 | 0.5-1ms/帧 ← 大头 | 摊薄为 0 |
| JSON 序列化（1-10KB） | 0.05-0.5ms | 同左 |
| HTTP 解析 / 长度前缀解析 | 0.1-0.5ms | <0.05ms |
| loopback RTT | <0.1ms | 同左 |
| 帧率上限 | ~500-1000 帧/s | ~2000-5000 帧/s |

帧率需求上限（50 符号活跃行情）约 250-500 帧/s——HTTP keep-alive 也能覆盖，但持久 TCP 同时
解决"连接管理"与"每帧开销"，且 stdlib-only 可行、与"无队列直推"形态天然契合（用户拍板方向）。

### E.4 前置验证（HIL/benchmark，**08-11 交易时段 shadow 执行**）

**全链路吞吐实测**（bridge 生产端 → datasource → backend → Redis），各段 p50/p95 +
事件计数，判定有无瓶颈后 E 方案按数据决策：

1. **回调线程阻塞性**：TDX 回调线程内直接 `get_market_snapshot` 的耗时/阻塞影响（决定是否
   线程交接）；QMT 回调内 `bounded_copy` 耗时（应为亚毫秒级）；
2. **bridge 生产端**：回调节奏密度、帧率（观测帧通道）；
3. **datasource 处理**：接收→处理延迟（O2a span）、处理能力余量；
4. **datasource → backend**：WS 发送延迟、backend 接收/解码延迟、**驱逐事件计数**
   （broadcast 超时踢 backend = 断流前兆——08-10 TDX 断流 56 分钟零感知教训）；
5. **finalizer → Redis**：封存延迟、`dueScanFailureCount`/写失败计数（失败无自动重试，
   需观测确认是否需补恢复）；
6. **判定标准**：各段 p95 延迟 <100ms、驱逐事件 = 0、写失败 = 0 → 链路无瓶颈，E 方案
   按设计落地；任何一项超标 → 在实施计划中追加对应缓解。

### E.4.1 观测通道（bridge 无 OTel，借道 datasource）

bridge 为 TDX 终端内 stdlib-only（Python 3.7），**无 OTel SDK/OTLP 端点，不可直连 OO**——
观测数据借道 datasource（唯一对外通道）：

1. **延迟/新鲜度（已存在，零改动）**：`mist_datasource_snapshot_age_seconds`——
   capturedAt = bridge 墙钟，datasource 同机（loopback）时钟一致 → age 有效，OO 可查；
2. **计数/耗时（新增观测帧）**：bridge 进程内累加（回调频率、拉取耗时、写满/合并丢弃计数，
   零成本）→ **每 30s 一个观测帧**（JSON，走现有 POST 观测端点；E 落地后与业务帧共用 TCP
   连接，帧类型字段区分）→ datasource 经 O2a 埋点层转 OTel counter/gauge → OO；
3. **HIL 临时 print**：bridge stdout 进终端进程，落盘性未验证——仅辅助。

E-0 两项前置验证的数据均走通道 2——观测帧是 E 方案组成部分，不增加独立链路。

### E.5 datasource 侧处理（收到 TCP 帧之后）

**复用原则：TCP 帧走与现有 HTTP 快照完全相同的处理流水线**（校验/证据/埋点零重复实现）。

```
TCP 连接（reader 协程）
  │ 读 4B 长度前缀 → 读 JSON → 按帧类型分发
  ▼
[register 帧]  owner 校验（复用现有注册逻辑）→ 连接绑定 (ownerId, generation, streamEpoch)
[snapshot 帧]  直接处理（无业务队列——背压设计见要点 3）
[observability 帧]  → O2a 埋点层转 OTel 指标（E.4.1 通道 2）
  ▼
复用 post_snapshot 流水线
  RFC3339 → native safety → contract 校验 → owner/收敛集合校验
  → _build_wire_frame → HIL evidence → O2a span/计数
  ▼
ws_manager.broadcast（现有 WS 广播，路由层逻辑抽为共享函数，HTTP 路由与 TCP handler 共用）
```

要点：
1. **接收端点**：datasource 进程内 asyncio TCP server（lifespan 启动/停止），TDX/QMT 各一端点
   （各自复用各自 owner/校验机制，避免耦合）；或单端口 + 首帧 provider 绑定（实施计划定）；
2. **连接级身份**：首帧 register（leaseToken/streamEpoch/bridgeBuildId/…）校验通过后绑定连接，
   后续 snapshot 帧**免 token**（连接级身份）；owner 被替换/retired → 发 error 帧 + 关连接；
   断连 → bridge 重连 → 重新 register（重发最新）；
3. **背压：默认无业务队列（与 bridge 侧一致，全链路无队列）**：
   - 广播层已有背压隔离（`ws/manager.py` broadcast：gather 并发 + wait_for 每客户端超时 +
     失败驱逐）——慢 backend 客户端不影响处理；
   - 瞬时抖动由 TCP 缓冲 + asyncio 排队天然吸收（KB-MB 级 = 几十-几百帧）；
   - 持续慢 → 背压传导到 bridge（socket 写满 → 丢帧+计数，latest-state 丢源头最优）；
   - **数据驱动**：E-0 吞吐实测若发现"帧到达→处理完成"延迟持续增长（非瞬时尖峰），再加
     有界 asyncio 队列（1024 + 丢弃计数）——队列是实测信号的响应，不是默认配置；
4. **共享函数抽取**：`post_snapshot`（校验+evidence+埋点）与路由层广播逻辑抽为内部共享函数，
   HTTP 路由与 TCP handler 均调用——HTTP 端点保留（观察期一个交易日，支持回滚）后退役；
5. **观测复用**：O2a span/计数/age gauge 天然复用；新增连接计数、处理延迟、丢弃计数（若有队列）。

### E.6 风险与成本（诚实声明）

- datasource 新 TCP 端点（asyncio 协议实现、注册/鉴权、重连、并发连接管理）——新代码，
  复用校验/广播栈降低风险；
- 四仓契约影响：bridge→gateway 传输层变更 → datasource fixture/契约测试、mist-deploy 健康
  检查、monitoring 观测同步（跨仓 HIL）；
- TDX stdlib-only：socket + struct + json 可行（Python 3.7），但需终端侧实测（tqcenter 环境
  的 socket 行为与防火墙/代理环境一致）；
- 双 bridge（TDX/QMT）分两批落地，各自 HIL；QMT 的 1s tick 保留作发送节拍或改事件驱动
  （与 C2b 同构）——实施计划阶段定。

---

## C1 备选（C2 不可行时的轻量方案）

- `POLL_INTERVAL_SECONDS` 3.0→1.0（datasource 仓一行）：帧密度 0.33→1 Hz，需 HIL 验证终端负载；
  保留 dirty 门控与 POST 即丢语义。

## 决策点（2026-08-10 owner 逐条确认结果）

1. ✅ 根因定案接受："量额正确、检查前提失效（M1）+ M2 遗留缺陷"；
2. ✅ 修复范围 **A + B + C2b + E（socket 持久连接直推）** 纳入本次；C1 备选、D 暂缓；
3. ✅ E 前置 HIL 两项（回调线程阻塞性 + 吞吐实测，走观测帧通道）排入；
4. ✅ E 帧格式/连接语义认可（4 字节长度前缀 + JSON；首帧注册；断连重连重发最新；写满丢帧+计数）；
5. ✅ A 容差公式 `max(0.6%×close, 5×(h−l))` + 4 条真异常判据认可（值实施计划阶段校准）；
6. ✅ B"价格帧"语义（双字段保持）认可；
7. ✅ change 命名 `fix-tdx-realtime-vwap-window-consistency` 保留。
