# 交接提示词 — fix-tdx-realtime-vwap-window-consistency 完成交接（2026-08-10）

> 来源：本线程（由 `handoff-prompts-fix-tdx-quantity-vwap.md` 发起）已**完成根因验证 → spec → 实施计划 → 落地 → 部署 → 首轮验收**。
> 剩余：**E-0 全链路实测（08-11 交易时段 shadow）** + 2 个改进项。
> 先读：`mist/openspec/changes/fix-tdx-realtime-vwap-window-consistency/`（spec/design/tasks/implementation-plan/evidence 全量）、
> `mist/docs/project-quality-governance-guide.md`。

---

## 一、已完成（按三步工作流）

### 1. 根因定案（evidence 全在 change 目录）

**vwap 出界不是量额精度问题**：
- 全链路无缩放/舍入错误（bridge 透传、converter bigint、aggregator Decimal8 精确）；单位 profile 有 08-03 生产证据钉死；
- **主因 M1（检查前提失效）**：TDX 桶 `[low,high]` 是采样带（回调直发前为 3s 轮询 + 秒级墙钟归属），桶内瞬变价格尖峰落在采样间隙时，**正确的 vwap 也会出带**——复现实验：精确量额下 16.9% 假阳性，sealed vwap 与真实 vwap 仅差 0.002-0.006%；
- **M2（dormant 缺陷）**：量额字段缺失时 v/a 窗口分叉（触发即 42.9% 级错误）——B 修复；
- 生产分布（30.5%、≤0.55%、双向、全下午）与 M1 机制吻合；QMT 5% 佐证（tick 级采样带≈真实带）。

### 2. 落地（三仓已推 master，无 PR 直接合）

| 仓 | 分支 | commit | 内容 |
|---|---|---|---|
| mist | feat/fix-tdx-quantity-precision → master | `7733b95`（merge）+ `6c28fc6`/`c334419`/`bc1fdf2`（docs） | **B**：价格帧规则（量额缺失双字段保持）+ `initializeQuantity` null 分支 `'0'`→`null`（防伪 0 桶）+ 缺字段帧计数/日志 + 3 新单测/1 旧用例重写 |
| mist-datasource | feat/fix-tdx-bridge-quantity → master | `99d2eab`→`8a4a268`→`52a2848`→`77e5cf7`→`7cb8630` | **C2b/E**：回调直发（TDX `get_full_tick` env 可切 `get_market_snapshot`）+ 持久 TCP（9003/9004，`[uint32 BE len][JSON]` 协议）+ 观测帧（每 30s `/observability`）+ **单文件约束**（SocketSender 内联，bit-identical 类体）+ **无锁 SocketSender**（owner 拍板 C 选项）+ 函数名对齐（`_push_snapshot`/`_make_subscription_callback`/`_compute_artifact_sha256`/`_register_owner` 等） |
| mist-deploy | master 直推 | `61f5e88` | **A**：vwap 检查分类（容差 `max(0.6%×close, 5×(h−l))` + 4 条真异常判据 + `vwapClassification` 输出 + 连续同向回溯） |

### 3. 部署与首轮验收（08-10 完成）

- 部署 `Deploy Windows Mist Stack` **31395447678 success**：mist `bc1fdf246f5...` + datasource `7cb8630f24e...`，**productization=shadow**；
- lifecycle=on 补设（`Set Windows Subscription Lifecycle` 31396288220 success——部署会重置 off，schema 缓存 422 坑：**lifecycle choice 值不传，部署后 string workflow 补设**）；
- **A4 验收**（`Read Windows Realtime Candle Closed Hash` 31396631162）：37 出界 = **33 samplingNoise + 4 quantityAnomaly 全部归因**（13:00 桶 missing_quantity_with_prices + 14:56-15:00 连续 3 桶同向尾盘）；
- **TDX 终端脚本比对 ✓**（`Inspect Windows Terminal Bridge Artifacts`，SHA 匹配）；
- **QMT 终端脚本：文件被加密，SHA 比对失效**（`matchingCandidateCount:0` 是静态检查局限，非代码问题）——**QMT 验证以 E-0 数据流为准**（用户已确认加载新版）。

---

## 二、当前生产状态（08-10 部署后）

- productization=**shadow** / lifecycle=**on**（补设）/ strategy=on；
- datasource TCP 端点 9003（tdx）/9004（qmt）已随新镜像监听；
- TDX/QMT bridge 均为**单文件脚本**（终端已加载）；QMT 文件加密（GBK/CRLF 未知，不影响运行）；
- 今日 600519 数据 vwap 检查：33 noise + 4 归因 anomaly。

---

## 三、待办

### 1. E-0 全链路实测（**08-11 交易时段 shadow**，设计 §E.4）

- 观测帧（每 30s POST `/observability`，datasource 日志 `bridge observability source=tdx|qmt`）：
  回调频率、fetch_none、send_dropped、sender 连接状态——**OO/datasource 日志查**；
- **get_full_tick 实测判定**：fetch_none / datasource rejected 计数 / backend sealed 数据（vwap 检查）——
  不行则 `MIST_TDX_QUOTE_API=market_snapshot`（env 一行切换，勿改代码）；
- **无锁观测**：`droppedFrames`（断线恢复场景），过多则加锁（implementation-plan §0.2）；
- 判定标准：各段 p95<100ms、驱逐=0、写失败=0；V1 复跑分布对比（B 不改正常路径）。

### 2. 改进项（下次部署一起）

- [ ] **buildId bump**：TDX/QMT `BRIDGE_BUILD_ID` → v3.0（现 v2.1/v2.0 无法区分新旧——运行时版本证据的前提）；
- [ ] **QMT health 暴露 bridgeBuildId**（现只有 TDX health 有）；
- [ ] `Inspect Windows Terminal Bridge Artifacts` 增加 **buildId 运行时比对**（文件 SHA 在加密场景降级）；
- [ ] 加密场景下的验证策略已记录（静态 SHA 不可用 → buildId + E-0 数据流）。

---

## 四、关键命令/文件索引

- spec：`mist/openspec/changes/fix-tdx-realtime-vwap-window-consistency/`（proposal/design/tasks/implementation-plan/evidence/规格 delta）
- 复现脚本：`.../evidence/vwap-window-repro.ts`（seed=20260810，真实 aggregator+converter）
- 部署：`gh workflow run "Deploy Windows Mist Stack" -f productization...`（**必传 shadow**；lifecycle 422 → string workflow 补设）
- 验收：`gh workflow run "Read Windows Realtime Candle Closed Hash" -f trading_day=YYYYMMDD -f source=tdx -f security_id=1`
- 脚本比对：`gh workflow run "Inspect Windows Terminal Bridge Artifacts" -f datasource_ref=master`（TDX 用；QMT 加密场景看 E-0）

## 五、坑（复用时注意）

1. **lifecycle/strategy choice 输入 schema 缓存 422**：部署时**不传** choice 值，部署后 string workflow 补设；
2. **QMT 脚本 gbk 头 + UTF-8 内容**：Windows 编辑器转码会改字节——文件 SHA 比对会失败（加密场景直接不可比）；
3. **单文件约束**：TDX/QMT 终端各只加载一个脚本（SocketSender 已内联，勿拆文件）；
4. **无锁 SocketSender**：竞态=丢帧计数（latest-state 容忍），E-0 观察 droppedFrames；
5. **TDX bridge guardrail**：禁 `threading.Thread`（主循环单线程事件驱动）；QMT guardrail 禁 `threading` import（SocketSender 无锁）；
6. `openspec validate --all --strict` 在 mist 主 worktree 跑（68 项）；CI 用 `ruff check .`（非 format）。
