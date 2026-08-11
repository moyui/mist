# Tasks: remediate-otel-audit-findings

> 状态约定：G1/G3/G5 为代码/设计修复；G2/G4 为 §5 用户拍板项（拍板后实施）。
> spec 确认后写实施计划（代码级），再落地。

## 1. G1：SDK 初始化单一路径（mist 仓）——✅ 已随 gaps G0 完成

> 2026-08-11 核对（master 65a1053）：官方 register 生效、initTelemetry 删除、
> 6 处 main.ts 调用移除、单测全绿（150 suites）——标记 done，不重复实施。

- [x] 1.1 ~ 1.4 核对 gaps G0 落地结果，确认 done。

## 2. G2：凭据集中一处 + 定时轮换（mist-deploy 仓，2026-08-11 拍板：A+C）

> 拍板：当前私有仓库接受风险；凭据**集中一处**（只经 .env 显式传入，git 零凭据默认），
> **定时轮换**（历史凭据作废，为将来开源做准备）。

- [x] 2.1 compose.yaml 4 处 `OO_OTLP_AUTH_BASE64` 默认值删除 → 必需项
      （`${OO_OTLP_AUTH_BASE64:?set OO_OTLP_AUTH_BASE64}`）。
- [x] 2.2 `OO_ROOT_USER_PASSWORD`（openobserve 服务）同样收敛为必需项（C）。
- [x] 2.3 `.env.example` 改为占位/注释（不落凭据）；deploy-defaults.ps1 显式生成/管理
      两个变量（从单一来源派生 base64）。
- [x] 2.4 CI 门禁（test-docker-compose-config.ps1）断言同步（必需项形态）。
- [x] 2.5 轮换流程文档化（mist-deploy docs/）：改 OO 密码 → 重算 base64 → 更新 .env →
      重启 OO + 服务；历史凭据作废。
- [x] 2.6 部署验证：2026-08-11 部署（mist 8d2b546 / deploy 8dad56b，run 31479653808 全绿）：
      OO_ROOT_USER_PASSWORD 从 GitHub secret 注入（空则 throw，部署无异常）；OTLP 用
      新凭据验证——traces（mist-backend 597 spans/30min）、logs（1204 条）、metrics
      （74 流持续写入，doc_time_max 实时）全部 200 入库；lifecycle 归一化 off 后补设 on
      （run 31479992900）+ TDX/QMT 流量恢复（3min 窗口 732/1526 spans）。

## 3. G3：计数归因 + 词汇——✅ 已随 gaps A1 完成

> 2026-08-11 核对（master 65a1053）：source+securityId label（D1a=securityId 定稿）、
> aggregator/finalizer/product 加维、candle-metrics label + 基数护栏（50）——标记 done。

- [x] 3.1 ~ 3.3 核对 gaps A1 落地结果，确认 done。

## 4. G4：monitoring 仓处置——✅ 已完成（2026-08-11 用户拍板处理干净）

> README 退役标记（7634f51）+ GitHub 仓库 archived=True；OpenSpec shrink change 已
> DEPRECATED 归档（d467aa1）——标记 done。

- [x] 4.1 README 退役标记 + GitHub archive，确认 done。

## 5. G5：日志资源边界——✅ 已随 gaps B1 完成

> 官方 instrumentation-pino 路径（无自研 transport）：缓冲/重试由 OTel 标准 env
> （OTEL_BLRP_*）可配——标记 done。

- [x] 5.1 核对 gaps B1 落地结果，确认 done。

## 6. 提交（三步工作流）

- [ ] 6.1 spec 确认通过后写实施计划（代码级）。
- [ ] 6.2 实施计划确认后落地。
- [ ] 6.3 归档（--skip-specs；delta 为修复类）。
