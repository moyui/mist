# Tasks: remediate-otel-audit-findings

> 状态约定：G1/G3/G5 为代码/设计修复；G2/G4 为 §5 用户拍板项（拍板后实施）。
> spec 确认后写实施计划（代码级），再落地。

## 1. G1：SDK 初始化单一路径（mist 仓）

> **2026-08-11：已随 otel-observability-gaps G0 完成**（切换官方 register + 删
> otel-preload.js/initTelemetry/6 处 main.ts 调用）。本段落地时核对 gaps 成果并标记 done，
> 不重复实施。

- [ ] 1.1 ~ 1.4 核对 gaps G0 落地结果（register 生效、initTelemetry 删除、spec 更新、
      单测全绿），确认后勾选。

## 2. G2：凭据收敛（mist-deploy 仓，用户拍板后）

- [ ] 2.1 compose.yaml 4 处 `OO_OTLP_AUTH_BASE64` 默认值处理（D2 拍板：必需项/占位）。
- [ ] 2.2 `.env.example` 同步（占位/注释）；deploy-defaults.ps1 显式管理该变量。
- [ ] 2.3 CI 门禁（test-docker-compose-config.ps1）断言同步；`OO_ROOT_USER_PASSWORD`
      一并评估（D2-C）。
- [ ] 2.4 部署验证：下次部署 OTLP traces/metrics 仍 200（凭据显式传入）。

## 3. G3：计数归因 + 词汇（mist 仓，与 gaps A1 共享决策）

- [ ] 3.1 D3 词汇定稿（securityCode vs securityId vs providerSymbol）。
- [ ] 3.2 aggregator/product diagnostics 按 source（+标的）汇总；candle-metrics skip/
      discard gauge 增加 label。
- [ ] 3.3 单测：reason/source 枚举有界；与 datasource 侧 `{source,reason}` 对齐断言。

## 4. G4：monitoring 仓处置（用户拍板后）

- [ ] 4.1 按 D4 决策：退役标记/README 更新/metrics-overview.md 对齐 OO 现状（或归档）。

## 5. G5：日志 transport 资源边界设计（交付设计，不实施）

- [ ] 5.1 D5 细化输出：缓冲上限、失败重试/丢弃策略、容量观察点——写入 design 供 gaps B1
      引用。

## 6. 提交（三步工作流）

- [ ] 6.1 spec 确认通过后写实施计划（代码级）。
- [ ] 6.2 实施计划确认后落地。
- [ ] 6.3 归档（--skip-specs；delta 为修复类）。
