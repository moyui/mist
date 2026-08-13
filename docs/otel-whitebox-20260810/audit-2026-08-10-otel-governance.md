# 日志+打点系统（OTel 白盒）质量审计报告 — 按 project-quality-governance-guide.md

> 2026-08-10。依据 `mist/docs/project-quality-governance-guide.md`（常驻治理指南）审计，
> 与 checklist 版审计（audit-2026-08-10-otel-logging-metrics.md，**作废**）独立、不复用结论。

## 范围
- mist：master @ `f73d3c1`，dirty=3（openspec 草稿目录：otel-observability-gaps、fix-tdx-realtime-vwap-window-consistency、live specs/mist-observability）
- mist-datasource：master @ `445b441`，clean
- mist-deploy：master @ `8317453`，clean（OTEL_SERVICE_NAME 修复，未部署）
- mist-monitoring：master @ `d467aa1`，clean（openspec 仅 archive）
- 包含：worktree（feat/alert-delivery-wecom）、归档 OpenSpec（O0/O1/O2a/5.2 相关）、生产 HIL（evidence-2026-08-10-*.md）、跨仓消费者（OpenObserve 是遥测唯一消费方）
- 审计对象：O0 底座 / O1 backend 管道 / O2a datasource / backtest 5.2 / 部署链路 / gaps 设计草稿

## 结论
- **通过（合规）**：OpenSpec 门禁、时间词汇、readiness 分层、退役字段检索、缺失值语义、验证报告区分
- **已修复**：service_name 串名（deploy 8317453，待部署生效）
- **待讨论**：G2 凭据收敛（§5 事项，用户拍板）；G4 monitoring 仓退役；gaps D1 label 词汇定稿
- **未验证/环境阻塞**：生产 candle spans（开盘首验）、8317453 生效、OO logs 流、repo 可见性

## Findings

| ID | 状态 | 严重度 | 文件:行 | producer → consumer 影响 | 建议 |
|---|---|---|---|---|---|
| G1 | 已确认 | 中 | `libs/otel/src/otel.ts:62-68,80-90` + 6 处 `main.ts` initTelemetry 调用 | 被 preload 替代的 fallback 仍宣称正式能力；serviceName 参数在 preload 下死参数 | gaps 决策：单一初始化路径 |
| G2 | 已确认 | 中 | `mist-deploy/docker/compose.yaml:94,124,157,209` + `.env.example:66` | 生产 OO 凭据 base64 常驻 git 默认值；deploy-defaults.ps1 未管理该变量 | §5 待用户拍板：收敛为必需项 |
| G3 | 已确认 | 中 | `candle-metrics.ts:110-117` vs `metrics.py:35-43` | skip/discard 计数无 source 归因；标的维度词汇未定（securityCode vs providerSymbol） | gaps A1：label 用 `source`+词汇表定稿 |
| G4 | 已确认 | 低 | `mist-monitoring` d467aa1（cmd/internal 残留） | exporter/watchdog 无生产 compose 消费方（白盒替代）；docs/metrics-overview 描述旧拉取架构 | monitoring 仓退役标记/文档对齐（用户拍板） |
| G5 | 已确认 | 低 | gaps spec D3（设计草稿） | 日志进 OO 的 transport 尚无有界队列/丢弃语义 | gaps D3 细化：缓冲上限+失败策略 |
| G6 | 合规确认 | — | `backtest-metrics.ts`（零值照发） | counter 零值=真实零（§6.5 "0 是有效值"）非补零 | 正面，无动作 |

### G1 详情【中】被替代链路仍作为正式能力
- 证据：`otel.ts:62-68` 注释 "remains as a fallback for direct `node dist/...` runs"；`otel.ts:80-90` fallback 在 bundle 内 start SDK（RITM 对已缓存 http/express/pino 不触发 → auto-instrumentation 静默失效）；`apps/{mist,backtest,chan,signal,schedule,realtime-subscription-hil}/src/main.ts` 6 处 `initTelemetry({serviceName})` 参数在 preload 路径下无效
- 影响链：main.ts 声称的 service 名 → preload 实际读 `OTEL_SERVICE_NAME`（compose 显式设）→ 参数失效；直跑场景（无 -r）得到"有遥测但关键链路缺失"的假健康
- 实际后果：08-10 串名缺陷（所有 app service_name=mist-backend）的结构性根因；任何绕过 preload 的启动方式无告警
- 边界/例外：mock 与生产均走 preload；fallback 仅直跑场景
- 验证方法：`node dist/apps/mist/main.js`（带 endpoint env，无 -r）→ OO 无 http server span
- 建议（gaps 决策）：preload 为唯一初始化路径；initTelemetry 删除或显式降级为 no-op 壳

### G2 详情【中】生产凭据默认值（§5 必须停下讨论）
- 证据：compose.yaml 4 处 `OO_OTLP_AUTH_BASE64:-cm9vdEBtaXN0...`（= base64("<OO_USER_REDACTED>:<OO_PASSWORD_REDACTED>") 可逆解）；`.env.example:66` 同值；`deploy-defaults.ps1` 无该变量（部署链未显式管理）
- 影响链：compose 默认 → 容器 env → OTLP Authorization header——凭据以可解形态常驻 git 历史
- §5 依据：生产真实配置与代码推断不一致（默认值即生产凭据）——AI 不得机械决定，**用户拍板**（收敛为 `.env` 必需项 / 移除默认）
- 边界：repo 可见性未确认（影响严重度）；同仓 `OO_ROOT_USER_PASSWORD` .env 默认同样明文（O0 引入）
- 验证方法：`base64 -d` 解出明文；确认 repo 公开/私有

### G3 详情【中】计数归因缺失 + label 词汇待定（§6.3）
- 证据：`candle-metrics.ts:110-117` skip gauge 仅 `{reason}`；`metrics.py:35-43` accepted/rejected 带 `{source,reason}`——**两仓不对称**；aggregator 计数 per securityId+source（可溯源），汇聚层丢维
- 影响链：aggregator skip 计数 → product.runtimeObservation().candle.skipTotals（全局合并）→ gauge `{reason}` → OO 查询无 source 维——08-10 实盘 `out_of_session=1170` 混源无法归因
- §6.3 依据：`source` 词汇 ✓（tdx|qmt）；**新增标的维度必须二选一**：`securityCode`（Mist 领域代码）或 `providerSymbol`（provider 标识）——gaps D1 当前写 "securityId/symbol" 混用，**需按词汇表定稿**（消费方按 securityCode 归因则用 securityCode）
- 建议（gaps A1）：label = `source` + 定稿后的单一词汇；O1"symbol 不得作 label"约束修订已走 MODIFIED delta ✓

### G4 详情【低】monitoring 仓已替代链路残留
- 证据：`mist-monitoring` master d467aa1：cmd/internal（exporter/watchdog）代码存在；生产 compose services 无 monitoring/exporter（白盒 OO 替代，08-09 已删）；openspec 仅 archive
- 影响链：无生产消费方；`docs/metrics-overview.md` 描述 exporter 拉取架构（白盒迁移后过时）
- 建议：退役标记 + README/文档对齐（或仓级归档）——用户拍板（monitoring 仓未来职责）

### G5 详情【低】日志进 OO 的资源边界未定义（§8）
- 证据：gaps spec D3 方向（pino transport → OTLP logs）；尚无 transport 缓冲上限、导出失败丢弃语义、流量容量观察设计
- §8 依据：新增队列/缓冲必须同时定义容量、超时、清理和失败语义
- 建议（gaps D3 细化）：transport 缓冲硬上限、失败丢弃策略、日志流量/留存观察点

## 正面发现（合规确认）

1. **§4 OpenSpec 门禁全合规**：O0/O1/O2a（已归档）、5.2（extract-backtest-runtime）、gaps（设计中）——所有指标/环境变量/跨仓契约变更均走 change
2. **§5 已停讨论**：O1"symbol 不得作 label"约束修订走 gaps MODIFIED delta（不直接改）；G2 凭据（用户拍板中）
3. **§6.4 时间词汇合规**：`snapshot_age_seconds` 基于 acceptedAt 单调时钟（`gateway.py:826-830`），不伪造 eventTime；TDX eventTime 例外已定案（§6.4 注释）
4. **§6.1 readiness 分层合规**：`bridge_ready`（bridge 层）、`backtest_ready`（admission 窗口）各有作用域；无无作用域 `ready`
5. **§6.3 source 词汇合规**：datasource label `source`=tdx|qmt；metrics 无 symbol label（当前状态）
6. **§10 退役检索**：`internal/realtime/*/status`、`collectorReady`、`tdxRealtimeBridgeReady` 零残留；Prometheus/Grafana 生产 compose 已删
7. **缺失值不补**：skipTotals undefined→不 observe、duration null→跳过、age None→跳过——三处"缺失不发"而非补零/补当前时间（§1 防劣化 #4、§6.5）
8. **§3.3 验证区分**：evidence-2026-08-10-*.md 区分 PASSED / 待交易时段；handoff 待办明确

## 验证
| 命令/证据 | 结果 | 说明 |
|---|---|---|
| 退役路径检索（grep） | ✅ 零残留 | collectorReady/tdxRealtimeBridgeReady/status 路径 |
| monitoring 残留检索 | ⚠️ exporter 代码存在 | G4，生产无消费方 |
| age 时间基准（读码） | ✅ acceptedAt monotonic | §6.4 合规 |
| gaps validate --strict | ✅ valid | 审计时 spec 草稿状态 |
| 5.2 基线（此前） | ✅ 151 suites / coverage 全过 | 当前 HEAD 为 docs commit，未重跑 |

## 发布与回滚
- 本次审计无发布动作（只识别）
- 修复全部走 change：G1/G3/G5 → `otel-observability-gaps`（spec 设计中，D 系列决策输入）；G2 → 独立小 change（涉及部署脚本 env 链，随下次部署验证）；G4 → monitoring 仓决策
- 回滚边界：G2 若收敛 env 为必需项，部署脚本需同步 Set-DockerEnvValue 链——不破坏现有部署（.env 已含值时无感）
