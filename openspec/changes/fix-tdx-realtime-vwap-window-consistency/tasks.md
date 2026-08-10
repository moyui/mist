# Tasks — fix-tdx-realtime-vwap-window-consistency

> 状态：Draft — 待 owner 确认修复方向（A+B 基线）后转实施计划。
> 每项含验证命令；落地时按三步工作流第 2 步细化到代码级。

## A. 检查侧异常分类（mist-deploy）

- [ ] A1. `read-windows-realtime-candle-closed.yml` 的 vwap 检查段输出 `vwapClassification`
      （samplingNoise / quantityAnomaly / skipped），每桶附分类标签（A.1 结构）
- [ ] A2. 容差实现 `tolerance = max(0.6% × close, 5 × (h−l))`（值待实施计划校准）
- [ ] A3. 真异常判据 4 条（design §A.3）落地（v/a null-with-prices、超容差、≥3 连续同向、cv/ca 不自洽）
- [ ] A4. 复跑验收：`gh workflow run "Read Windows Realtime Candle Closed Hash" -f trading_day=20260810
      -f source=tdx -f security_id=1`（及 security_id=10）→ 36/10 桶全归 samplingNoise、quantityAnomaly=0

## B. canonical 窗口一致性（mist）

- [ ] B1. `open-candle-aggregator.ts`：量额字段部分/全部缺失 → 双字段保持（价格帧规则，design §B.2）
- [ ] B2. 缺字段帧计数 + info/warn 日志（判断点带 trace_id）
- [ ] B3. 单测（design §B.4 六用例）：
      `npx jest apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts --runInBand`
- [ ] B4. 回归基线：正常帧流 sealed 记录字节级不变（复用现有 replay spec）
- [ ] B5. 验证命令：`npm run lint:check && npm run typecheck && TZ=UTC npm run test:ci`
      （mist 基线，治理指南 §11）

## C2. 事件驱动拉快照（mist-datasource，owner 提议方向）

- [x] C2-0. **文档验证（已完成 2026-08-10）**：`tdxquant-live-datasource-smoke.md:223-229`
      （TDX 官方 help `mindoc-1h1104d65vr68`）证实回调 payload 仅 `{Code, ErrorId}` 无行情数据
      → **C2a 直接入队不可行，C2b 事件驱动拉快照定案**（回调频率无需定标，owner 拍板）
- [ ] C2-1. **真实快照字段抓帧观测**（HIL 前置）：临时抓帧/日志记录 get_market_snapshot 返回
      字段形态（Volume 整数/小数、Amount 精度），钉死量额 profile；当前遥测只记计数不落字段
- [ ] C2-2. worker 改造：**纯事件驱动**（回调置 dirty + 通知 → 立即拉取 POST；无事件阻塞等待，
      **无兜底轮询**）+ 防抖最小间隔（200-500ms，参数化）
- [ ] C2-3. 回调线程不变量保持（仍只置 dirty，无 SDK/HTTP）；拉取在独立线程
- [ ] C2-4. `ACQUISITION_PROFILE` 语义文档更新（datasource 仓）；wire 契约不变
- [ ] C2-5. 验证：HIL（终端负载、帧数/假阳性率对比）→ mock-env 回放事件序列

## E. socket 持久连接直推（mist-datasource，owner 拍板方向）

- [ ] E-0. **前置验证（HIL，08-11 交易时段 shadow 执行）**：全链路吞吐实测（design §E.4）——
      ① TDX 回调线程内 `get_market_snapshot` 阻塞性；② bridge 帧率/回调节奏密度；③ datasource
      处理延迟；④ backend 接收/解码延迟 + **驱逐事件计数**；⑤ finalizer→Redis 封存延迟/写失败
      计数——数据走观测帧通道（bridge 无 OTel，借道 datasource：进程内累加 → 每 30s 观测帧 →
      datasource O2a 埋点 → OO，design §E.4.1）；判定 p95<100ms、驱逐=0、写失败=0
- [ ] E-1. **datasource gateway TCP 接收端点**：asyncio 长度前缀帧协议（`[uint32 BE len][JSON]`），
      首帧注册（leaseToken/streamEpoch 连接级身份），复用现有校验/广播栈；并发连接管理
- [ ] E-2. **TDX bridge**：stdlib socket 发送器（连接生命周期/重连）；事件驱动拉快照 → 直推；
      写满/失败丢帧 + 计数；一轮 dirty 多符号打包一帧
- [ ] E-3. **QMT bridge**：取消 4MB 队列/8 条 tick 节流/5s 超龄丢弃 → 回调 `latest[symbol]`
      单槽覆盖 + 事件通知 → socket 直推（多符号打包）；1s tick 保留为发送节拍或改事件驱动
- [ ] E-4. 断连重连语义（重连后重发最新，latest-state）；写满丢弃计数 + 日志（trace 对齐）
- [ ] E-5. 跨仓契约同步：datasource fixture/契约测试、mist-deploy 健康检查、monitoring 观测、
      四仓 fixture sha256
- [ ] E-6. HIL：终端负载、帧数/假阳性率对比（复跑 vwap 检查）→ mock-env 回放验证

## 验证（跨步共用）

- [ ] V1. 复跑 workflow 对比修复前后分类（A4 即验收）
- [ ] V2. 复现脚本 `evidence/vwap-window-repro.ts` 保持可运行（seed 固定），B 后补跑确认
      正常路径分布不变
- [ ] V3. `openspec validate --all --strict` 通过

## 明确不做（除非 owner 另行确认）

- C（bridge 轮询 3s→1s）：datasource 仓 + provider 行为变更
- D（contract 量额必填化）：wire 契约 + 四仓 fixture sha256 同步
- capture-realtime-provider-anomalies 的采集实现（本 change 只对齐分类词汇）
