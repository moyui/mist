# Proposal: remediate-otel-audit-findings

## Why

2026-08-10 按 `mist/docs/project-quality-governance-guide.md` 对"日志+打点系统"
（OTel 白盒监控 O0/O1/O2a/5.2 + 部署链路）完成治理审计（
`otel-whitebox-20260810/audit-2026-08-10-otel-governance.md`），确认 6 项 findings，
其中 G1-G5 需要修复（G6 为合规确认，无动作）。本 change 按审计报告单独修复，
不并入 `otel-observability-gaps`（那是功能增强 change）。

## What Changes

按审计报告逐项修复：

- **G1（中）被替代链路仍作为正式能力**：`initTelemetry` 的 fallback 路径（bundle 内
  SDK 初始化 + 6 处 main.ts serviceName 死参数）——统一为 preload 单一初始化路径：
  `otel-preload.js` 唯一 SDK 入口；`initTelemetry` 删除或降级为显式 no-op 壳；
  main.ts 的 serviceName 参数移除或改为注释说明（避免"参数有效"的假象）。
- **G2（中）生产凭据默认值**（§5 用户拍板项）：compose.yaml 4 处
  `OO_OTLP_AUTH_BASE64` 默认值（生产 OO 凭据 base64）与 `.env.example` 收敛为
  `.env` 必需项（remove default），部署脚本链（deploy-defaults.ps1 /
  Set-DockerEnvValue）显式管理；`OO_ROOT_USER_PASSWORD` 同仓明文默认一并评估。
- **G3（中）计数归因 + 词汇**：skip/discard 计数增加 `source` label，标的维度按
  §6.3 词汇表定稿（`securityCode` 或 `providerSymbol` 二选一）；汇聚层
  （skipTotals/discardTotals）按 source（+标的）汇总；与 datasource 侧
  `{source,reason}` 对齐。
- **G4（低）monitoring 仓残留**（用户拍板项）：mist-monitoring exporter/watchdog
  无生产消费方——退役标记 + README/docs/metrics-overview.md 对齐 OO 现状
  （或仓级归档，按用户决策）。
- **G5（低）日志进 OO 资源边界**：随 gaps B1 落地前定义 pino transport 缓冲上限、
  导出失败丢弃策略、日志流量/留存观察点（本 change 只出设计，实施在 gaps 或随
  gaps 同步）。

### 边界（不做）

- 不实施 gaps 的功能增强（埋点补强 A1-A3、日志进 OO 本身）——G3 的 label 词汇
  定稿与 gaps A1 共享同一决策，本 change 只修审计项不实现新埋点。
- 不改动 `REALTIME_PRODUCTIZATION_MODE`。
- 不恢复退役字段、Chan persistence 或延期 schedule 能力（§6 冻结决策）。

## Capabilities

- `otel-runtime-init`（新或 MODIFIED）：SDK 初始化单一路径（preload 唯一）——
  对应 `libs/otel` 与 `otel-preload.js`。
- `otel-observability-assets`（新）：凭据/部署 env 治理（compose/.env 收敛）。
- 既有 `mist-observability` 子 spec 的修订（低基数约束等）归 gaps 的 MODIFIED
  delta，本 change 不重复。

## Assumptions

- G2/G4 为治理指南 §5 讨论项，实施前需用户拍板（凭据收敛方式、monitoring 仓处置）。
- G5 的缓冲/丢弃设计不阻塞 gaps B1（gaps 实施时引用本 change 设计）。
