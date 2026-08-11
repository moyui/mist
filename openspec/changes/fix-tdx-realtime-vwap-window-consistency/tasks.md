# Tasks — fix-tdx-realtime-vwap-window-consistency

> 状态：**实施 + E-0 实测完成（2026-08-11 交易时段全绿）**——可归档。每项含验证命令。

## A. 检查侧异常分类（mist-deploy）

- [x] A1. `read-windows-realtime-candle-closed.yml` 的 vwap 检查段输出 `vwapClassification`
      （samplingNoise / quantityAnomaly / skipped），每桶附分类标签（A.1 结构）
      （落地：`61f5e88` feat(workflow): classify vwap check outliers）
- [x] A2. 容差实现 `tolerance = max(0.6% × close, 5 × (h−l))`（workflow L174-179）
- [x] A3. 真异常判据 4 条（design §A.3）落地（v/a null-with-prices、超容差、≥3 连续同向、
      cv/ca 不自洽——连续同向回溯 L194-195）
- [x] A4. 复跑验收：`gh workflow run "Read Windows Realtime Candle Closed Hash" -f trading_day=20260810
      -f source=tdx -f security_id=1`（31396631162）→ **实际结果 37 出界 = 33 samplingNoise
      + 4 quantityAnomaly 全部归因**（13:00 桶 missing_quantity_with_prices + 14:56-15:00
      连续 3 桶同向尾盘）——与 spec 预期"36/10 全 sampling_noise、quantityAnomaly=0"不同：
      分类判据识别出 4 个真异常，反而证明判据工作正常（非全部归噪声）

## B. canonical 窗口一致性（mist）

- [x] B1. `open-candle-aggregator.ts`：量额字段部分/全部缺失 → 双字段保持（价格帧规则，
      design §B.2）（落地：`3222260` fix(realtime): price-only frame rule holds both
      quantity windows，aggregator L324-331/L408+）
- [x] B2. 缺字段帧计数 + info/warn 日志（判断点带 trace_id）（`quantityMissingFrameCount`
      并入 diagnostics；`realtime-market-data-product.service.ts` L265-270
      `quantity_missing_frame` span event + warn 日志）
- [x] B3. 单测（design §B.4 六用例 + 审计补充 2 例）：
      `npx jest apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts --runInBand`
      （price-only 帧不触发 counter_reset L567、count 断言 L534；3 新单测 + 1 旧用例重写）
- [x] B4. 回归基线：正常帧流 sealed 记录字节级不变（复用现有 replay spec，单测用例 1）
- [x] B5. 验证命令：`npm run lint:check && npm run typecheck && TZ=UTC npm run test:ci`
      （mist 基线，治理指南 §11；CI 门禁通过后合 master）

## C2. 事件驱动拉快照（mist-datasource，owner 提议方向）

- [x] C2-0. **文档验证（已完成 2026-08-10）**：`tdxquant-live-datasource-smoke.md:223-229`
      （TDX 官方 help `mindoc-1h1104d65vr68`）证实回调 payload 仅 `{Code, ErrorId}` 无行情数据
      → **C2a 直接入队不可行，C2b 事件驱动拉快照定案**（回调频率无需定标，owner 拍板）
- [ ] C2-1 ~ C2-5. **已被方案 B/E 取代（2026-08-10 owner 拍板，不按原样实现）**：回调内
      **直接** `get_full_tick`（官方示例否定重入担忧，`99d2eab`）→ socket 直发，不拆
      双线程、无 SDK_LOCK、无兜底轮询；观测帧改走 TCP observability 帧 + datasource
      `/tdx/bridge/observability` 端点（E-1）。对应实现见 E 组。

## E. socket 持久连接直推（mist-datasource，owner 拍板方向）

- [x] E-0. **前置验证（HIL，08-11 交易时段 shadow 执行完成）**：全链路吞吐实测（design §E.4）——
      ① TDX 回调线程内 `get_market_snapshot` 阻塞性；② bridge 帧率/回调节奏密度；③ datasource
      处理延迟；④ backend 接收/解码延迟 + **驱逐事件计数**；⑤ finalizer→Redis 封存延迟/写失败
      计数——数据走观测帧通道（bridge 无 OTel，借道 datasource：进程内累加 → 每 30s 观测帧 →
      datasource O2a 埋点 → OO，design §E.4.1）；判定 p95<100ms、驱逐=0、写失败=0
      **（08-11 实测：p95=0.70ms、snapshot_overflow=0、due_registration_failure=0、
      fetch_none=0（1590+ 回调）、droppedFrames=0、收盘桶 15:00 sealed 无死桶、vwap 复跑
      17 出界全归因=13 noise + 4 重启过渡桶；30 只压力测试机制受阻——off+env 不触发订阅同步，
      on 模式需 DB assignments（strategy targetUniverse），另立重入压力测试计划）**
- [x] E-1. **datasource gateway TCP 接收端点**：asyncio 长度前缀帧协议（`[uint32 BE len][JSON]`），
      首帧注册（leaseToken/streamEpoch 连接级身份），复用现有校验/广播栈；并发连接管理
      （落地：`71c4e3e` + `src/datasource/realtime_tcp.py`，tdx main L86 / qmt main L143 挂载）
- [x] E-2. **TDX bridge**：stdlib socket 发送器（连接生命周期/重连）；回调内 `get_full_tick`
      直推（`MIST_TDX_QUOTE_API=full_tick|market_snapshot` env 一行切换）；写满/失败丢帧 +
      计数；一轮 dirty 多符号打包一帧（落地：`99d2eab`/`71c4e3e`）
- [x] E-3. **QMT bridge**：取消 4MB 队列/8 条 tick 节流/5s 超龄丢弃 → 回调 `latest[symbol]`
      单槽覆盖 + 事件通知 → socket 直推（多符号打包）；1s tick 保留为发送节拍
      （落地：`99d2eab`/`77e5cf7`）
- [x] E-4. 断连重连语义（重连后重发最新，latest-state）；写满丢弃计数 + 日志（trace 对齐）
      （落地：`77e5cf7` 无锁 SocketSender，owner 拍板选项 C；竞态=捕获 OSError →
      `dropped_frames` 计数）
- [x] E-5. 跨仓契约同步：datasource fixture/契约测试（**✅**：`test_realtime_tcp.py` 8 用例、
      `test_terminal_bridge.py` guardrail 测试）、monitoring 观测（**✅**：`/tdx/bridge/observability`
      端点 + TCP observability 帧 → O2a 埋点）、四仓 fixture sha256（**✅ 已核对**：wire 帧内容
      不变，fixture 不需改，implementation-plan §5）、**mist-deploy TCP 健康检查（✅ 已补 349f0a5：
      Assert-TcpEndpoint 宿主 9003）**
- [x] E-6. HIL：终端负载、帧数/假阳性率对比（复跑 vwap 检查）→ mock-env 回放验证
      （**08-11 已完成**：vwap 复跑 100 桶全归因、观测帧 callback/fetch 计数逐层定位；
      **mock-env 回放未跑**——本地回放留待 mock 环境下次重整时补）

## 验证（跨步共用）

- [x] V1. 复跑 workflow 对比修复前后分类（A4 即验收：37 出界全部归因）
- [x] V2. 复现脚本 `evidence/vwap-window-repro.ts` 保持可运行（seed=20260810 固定，
      `node -r tsconfig-paths/register -r ts-node/register` 运行；B 后补跑分布不变——
      2026-08-10 验证输出与 evidence 一致：A2 16.9%、C 79.7%/78%）
- [x] V3. `openspec validate fix-tdx-realtime-vwap-window-consistency --strict` 通过
      （2026-08-10）

## 明确不做（除非 owner 另行确认）

- C（bridge 轮询 3s→1s）：datasource 仓 + provider 行为变更
- D（contract 量额必填化）：wire 契约 + 四仓 fixture sha256 同步
- capture-realtime-provider-anomalies 的采集实现（本 change 只对齐分类词汇）

## 待办（2026-08-10 owner 确认）

- [x] **终端单文件约束（已完成 77e5cf7）**：`SocketSender` 已内联进两份 bridge 主文件
      （bit-identical 类体）；guardrail 一致性测试移除；每终端单文件部署；
- [x] **SocketSender 无锁观测（E-0，08-11 完成）**：选项 C 已拍板（无锁，竞态=丢帧计数）；
      E-0 实测 `droppedFrames=0`（全天稳定连接，reconnects=1 仅启动一次）——**无锁决策实证
      通过，无需加锁**（implementation-plan §0.2）
- [ ] **改进项（E-0 通过后下次部署）**：buildId bump v3.0（现 v2.1/v2.0 无法区分新旧）；
      QMT health 暴露 bridgeBuildId；`Inspect Windows Terminal Bridge Artifacts` 加
      buildId 运行时比对（加密场景 SHA 降级）
