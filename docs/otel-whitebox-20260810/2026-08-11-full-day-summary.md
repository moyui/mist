# 2026-08-11 全天工作总结 — TDX 行情四层故障修复 + 重入架构改造 + VWAP 修正

> 本文档覆盖 2026-08-11 全天工作：从 gaps 部署测试发现 TDX 行情断流，
> 到四层故障逐一定位修复，再到重入问题讨论 + 桥队列解耦 + VWAP 反向修正的
> 完整 change 落地。供后续会话/线程复用。

---

## 一、时间线概览

| 时段 | 主线 | 状态 |
|---|---|---|
| 上午 09:00-12:00 | gaps 部署测试 → 发现 candle 链路断 → 四层故障定位修复 | ✅ 修复 |
| 中午 12:00-13:00 | get_full_tick 实测 + QMT 9004 占用者确认 | ✅ 定案 |
| 下午 13:00-15:00 | TDX 全链路验证 + E-0 实测 + 收盘桶 + vwap 复跑 | ✅ 全绿 |
| 下午 14:30 | 30 只压力测试尝试（机制受阻） | ⚠️ 记录 |
| 晚上 15:00-24:00 | 重入讨论 → 桥队列解耦 + VWAP 修正 change 落地 | ✅ 代码完成 |
| 收尾 | tasks 勾选 + 桥脚本待 copy + QMT 待恢复 | ⏸️ 待一起弄 |

---

## 二、TDX 行情四层故障（上午核心）

### 故障现象

gaps 部署（65a1053）后测试发现：
- `tdx.snapshot.ingest` = 0（无行情帧进 datasource）
- `candle.snapshot.process` = 0（backend 无 candle 处理）
- `mist_candle_sealed_total` = 0（无封存）
- 桥活着（poll/observability 流动）、订阅收敛（desired=2/converged=2）

### 四层故障链 + 修复

| # | 故障 | 根因 | 修复 commit |
|---|---|---|---|
| ① | compose 缺 9003 TCP 映射 | 方案 B 部署时漏配（从未加过）→ 桥 SocketSender 连 127.0.0.1:9003 失败 → 全 dropped | mist-deploy `349f0a5`（9003 映射 + defaults + CI 断言 + Assert-TcpEndpoint 健康检查） |
| ② | lifecycle 部署重置 off | deploy workflow choice schema 422 坑 + Set-DockerEnvValue 覆盖 | Set Subscription Lifecycle 补设 on（多次） |
| ③ | get_full_tick 不存在 | TDX tdxquant SDK 无此方法（官方导航只有 get_market_snapshot/get_market_data/get_pricevol/get_benchmark_data；get_full_tick 是 QMT 方法）→ 回调内 AttributeError → fetch_none | mist-datasource `05949ed`（默认改 market_snapshot）→ 后续 `9820028` 删除死代码 |
| ④ | datasource TCP 无身份绑定 | realtime_tcp register 只查 type 不校验 lease；snapshot 帧不注入连接身份 → ingest_tdx `frame["leaseToken"]` KeyError → `tcp snapshot reject error='leaseToken'` | mist-datasource `69e8fff`（validate_owner 注入 + 连接绑定 + snapshot 帧注入 lease/epoch） |
| ⑤ | 桥 register_frame 静态 | datasource 重启后 gateway owner 变，桥重连带旧 lease → owner_mismatch 拒绝循环 | mist-datasource `e686b25`（_make_register_frame 每次重连用 owner 当前 lease 重建） |

### 最终定案桥脚本

mist-datasource `a6e7756`（market_snapshot 终端实测定案 + register 刷新）→ 后续 `9820028` 删除 get_full_tick 死代码。

---

## 三、QMT 侧

### 9004 端口占用

- `inspect-windows-port` workflow（新工具 `49d2548`）查实：**9004 被 XtItClient.exe（PID 6300）占用**——QMT 客户端自己的本地通道
- Windows 排除范围不含 9004（排除段：1721-1820/1921-2020/2997-3196 等）
- 解决：QMT 桥改连 **9014**（mist-datasource `ab45ff6` 默认 9014 + mist-deploy `978c07a` compose 映射 9014→容器 9004）

### QMT REALTIME_MODE 重置

- QMT datasource `realtimeMode=off`（部署重置）→ subscriptions ready=false → 503
- Set Realtime Mode（builtin）恢复 → 订阅恢复（sync_subscriptions success）

### QMT 待恢复（用户晚上处理）

- `setx QMT_TCP_PORT 9014` + 重启 QMT 终端
- QMT 桥脚本更新（手动 copy v3.0）

---

## 四、E-0 全链路实测（下午，TDX 全绿）

| 判定项 | 标准 | 实测 | 结果 |
|---|---|---|---|
| 处理延迟 | p95<100ms | p50=0.47ms / p95=0.70ms / max=1.0ms | ✅ |
| 驱逐 | =0 | snapshot_overflow_total=0 | ✅ |
| 写失败 | =0 | due_registration_failure=0 | ✅ |
| fetch_none | =0 持续 | 1590+ 回调 0 失败 | ✅ |
| droppedFrames | 0 | 0（reconnects=1 仅启动） | ✅ |
| sealed | 持续增长 | 36+（双标的 60s 封存） | ✅ |
| 收盘桶 | 15:00 sealed 无死桶 | 15:02 sealed ×2、无 15:01/15:02 死桶 | ✅ |
| vwap 复跑 | 出界全归因 | 100 桶 / 17 出界 = 13 noise + 4 重启过渡桶 | ✅ |

### 4 个 missing_quantity 桶归因

全部是 backend 三次重启的过渡桶（基线重建）：13:05（lifecycle 补设）/ 13:48（QMT mode 设置）/ 14:51-14:52（压力测试恢复）——**零真异常**。

---

## 五、重入讨论 + 新 change（晚上核心）

### 问题

方案 B（回调直调）破坏了 C0.1 frozen 不变量：
- 桥代码 L8-10 注释："subscribe_hq callback ONLY marks symbols dirty"
- SDK 文档（smoke.md:245）："keep the callback thin"
- 方案 B 在回调内直接调 get_market_snapshot + send → 重入风险（SDK 内部不透明）

### 讨论要点

1. **Python 重入风险**：SDK（C 扩展）内部锁/状态不透明；GIL 管不到 C 内部；回调内调 SDK 可能死锁/状态破坏
2. **dirty vs 队列**：SDK 回调只给 Code（不给数据）→ 队列也保不住"那一刻状态"→ dirty 合并等效
3. **用户洞察：vwap 反向修正**——vwap（真实成交）比 high/low（采样带）可信 → 用 vwap 约束 high/low
4. **TDX SDK 示例启发**（定时器实时预警脚本）：官方典型用法是主循环调 SDK（不在回调里）
5. **用户方案：发布-订阅解耦**——回调 publish（put 队列）+ 主线程 subscribe（drain 队列）→ 回调 thin + 主线程安全

### 最终方案（三层覆盖）

| 层 | 解决问题 | 实现 |
|---|---|---|
| A. 桥队列解耦 | 重入风险 | 回调 thin（append queue）+ 主线程 drain（fetch/send）|
| B. VWAP 反向修正 | 出界/准入 | toSealed: high=max(high,vwap); low=min(low,vwap) |
| C. 函数对齐 | 工程一致性 | TDX/QMT 统一 BRIDGE_QUEUE + _drain_bridge_queue |

### change: `decouple-bridge-callback-and-correct-vwap-bounds`

- spec `1845fa9`（proposal/design/tasks/specs delta，validate 通过）
- 实施计划 `098901d`（代码级）
- 落地：
  - mist-datasource `4869757` + `528decf`（TDX+QMT 桥队列 + guardrail 测试）
  - mist `4d5efda`（toSealed VWAP 修正 + 4 单测）
  - 部署 `31509011752` success

---

## 六、high/low 语义变更（governance §5）

| | 修正前 | 修正后 |
|---|---|---|
| 含义 | 采样带 last-price 极值 | 采样带极值 ∪ {vwap} |
| 可靠性 | 可能漏瞬变尖峰 | 至少包含真实成交均价 |
| 自洽性 | vwap 可能出界 | vwap 一定在 [low, high] 内 |

信任方向：**vwap（真实成交）> high/low（采样带）**。

---

## 七、新工具（mist-deploy，今天新增）

| workflow | commit | 用途 | 现状 |
|---|---|---|---|
| `dump-windows-datasource-logs` | `f4e913c`/`7acee06` | docker logs 容器（观测帧/reject） | ⚠️ 被另一线程标 deprecated（SSH/OO 替代） |
| `inspect-windows-port` | `d928c26`/`49d2548` | netstat 查端口占用 | ⚠️ 被另一线程退役（SSH 替代） |
| `update-windows-tdx-bridge-script` | `a7e99a7` | 复制桥脚本到终端 | ⚠️ 被另一线程退役（scp 替代） |
| `set-tdx-allowlist-stress` | `e7fd3d7` | 压力测试 allowlist + clear | ⚠️ 被另一线程退役（声明式配置） |
| `Assert-TcpEndpoint` | `349f0a5` | TCP 健康检查（9003/9014） | ✅ 保留（health-check 脚本内） |

### 另一线程交叉（830152c + 8a149f9）

- `830152c`：Windows OpenSSH ops channel（SSH 运维通道——runbook 已写，enable workflow + 密钥未落地）
- `8a149f9`：声明式 realtime 配置（删 REALTIME_SUBSCRIPTION_LIFECYCLE_MODE env + allowlist env → DB 读；删 set-windows-subscription-lifecycle.yml 等）

---

## 八、关键 commit 索引

### mist-datasource
| commit | 内容 |
|---|---|
| `05949ed` | 默认 market_snapshot（get_full_tick 实测前） |
| `69e8fff` | datasource TCP identity（validate_owner + 注入） |
| `e686b25` | 桥 register_frame 刷新（每次重连重建） |
| `a6e7756` | market_snapshot 终端实测定案 |
| `ab45ff6` | QMT TCP 端口 9014 |
| `9820028` | 删除 get_full_tick 死代码 |
| `4869757` | **TDX+QMT 桥队列解耦 + guardrail** |
| `528decf` | QMT guardrail 测试修复（v3.0 + 队列回调） |

### mist
| commit | 内容 |
|---|---|
| `4d5efda` | **toSealed VWAP 反向修正 + 4 单测** |
| `6a310da` | vwap tasks E-0/E-5/E-6 勾选 |
| `30d34fa` | gaps tasks 5.2 勾选 |
| `1845fa9` | decouple change spec |
| `098901d` | decouple change 实施计划 |

### mist-deploy
| commit | 内容 |
|---|---|
| `349f0a5` | 9003 映射 + Assert-TcpEndpoint |
| `2530021` | QMT 9004 搁置（后改 9014） |
| `978c07a` | QMT 9014 映射 |
| `a7e99a7` | update-bridge-script workflow（后被退役） |
| `d928c26` | inspect-windows-port workflow（后被退役） |
| `f701ea3`/`e7fd3d7` | set-tdx-allowlist-stress（后被退役） |
| `f4e913c`/`7acee06` | dump-windows-datasource-logs |
| `830152c` | SSH ops channel（另一线程） |
| `8a149f9` | 声明式配置（另一线程） |

---

## 九、待办（一起弄时）

### 桥脚本更新（用户手动 copy）
- TDX: `tdx/builtin_bridge/mist_tdx_realtime_bridge.py`（SHA `558c0f86...`）→ `F:\quant\tdx\PYPlugins\user\`
- QMT: `qmt/builtin_bridge/mist_qmt_realtime_bridge.py`（SHA `f0ecd4ad...`）→ `F:\quant\qmt\python\正式采集.py`
- buildId 确认：v3.0（两桥）

### 终端重启
- TDX: 重启 TdxW.exe
- QMT: 确认 `setx QMT_TCP_PORT 9014` + 重启 XtItClient.exe

### 验证
- 观测帧：队列消费（callback → fetch/send + droppedFrames=0）
- buildId v3.0 确认（health 端点）
- vwap 检查复跑：出界率应大幅下降（VWAP 修正后理论为 0）
- QMT 数据流恢复（qmt.snapshot.ingest + candle）

### 声明式配置（另一线程 8a149f9）的协调
- lifecycle 不再 env（DB 读）——确认声明式配置下 lifecycle 怎么控制
- allowlist 从 DB（security_source_configs）——Set Business Allowlist workflow 的 DB-direct writer
- SSH ops 通道落地（enable-windows-openssh workflow 跑 + macOS 密钥/config 配）

### change 归档
- `fix-tdx-realtime-vwap-window-consistency`：改进项（buildId v3.0）已由 decouple change 承接 → 可归档
- `decouple-bridge-callback-and-correct-vwap-bounds`：HIL 验证后归档
- `otel-observability-gaps`：5.2 已勾，6.3 归档待定

---

## 十、经验教训

1. **方案 B 落地时未 HIL 验证 TCP 链路**——9003 未映射 + get_full_tick 不存在 + TCP identity bug 三个问题被"TCP 不通"掩盖（帧没到 datasource），直到 08-11 9003 修好才逐层暴露
2. **"官方示例"需区分 TDX/QMT**——get_full_tick 是 QMT 方法，TDX 的官方示例/文档要求 thin callback
3. **观测帧（E-0 通道）是分层定位的关键**——callback_count/fetch_none/send_dropped/sender connected 逐层隔离出每一层断点
4. **datasource Python 日志不进 OO**——观测帧数据只能 docker logs 挖（SSH/工具化后改善）
5. **vwap 反向修正比提高 fetch 频率更根本**——采样带本质问题无法靠频率消除，用最可信的 vwap 兜底才是正解
6. **多线程工作交叉**——今天的 deploy 仓被另一线程并行修改（SSH + 声明式配置），导致 workflow 被退役/重命名——需要协调
