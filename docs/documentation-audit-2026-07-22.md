# 2026-07-22 跨仓库文档盘点

## 范围与规则

本轮检查六个生产仓库：`mist`、`mist-datasource`、`mist-deploy`、`mist-fe`、
`mist-monitoring`、`mist-skills`。

面向开发者和运维人员的当前文档默认使用简体中文；命令、API path、环境变量、
protocol field、class 名称和产品名保留原文。以下内容不做追溯翻译或“修正”：

- `openspec/changes/archive/` 历史证据；
- 官方网页 capture；
- `review-*-evidence.md` 已完成审查证据；
- generated OpenAPI JSON/summary 中的机器契约。

这些文件可以保留当时状态，但当前 README/runbook 不得再引用它们作为现行命令。

## 已修订

### `mist`

- `README.md`：改为当前 Docker + 双 WinSW datasource + 双桌面 bridge 拓扑。
- `Roadmap.md`：标记为历史草稿，指向 living OpenSpec roadmap。
- `apps/mist/README.md`：改为中文当前 API、迁移和 memory-only realtime 边界。
- `deploy/docker/README-Windows-Docker.md`：补齐 frontend、gateway、QMT datasource
  与四类独立运维入口。
- `docs/backend-datasource-integration.md`：删除旧 `/ws/quote`、QMT 未验证与统一
  provider 假设，记录当前 TDX/QMT 历史/实时链路。
- `docs/production-baseline-verification.md`：重写为当前 workflow 和盘中/盘后验收
  手册。

### `mist-datasource`

- `README.md`：删除 TDX `legacy` 默认、旧 adapter、DAT 与手工删除旧策略说明。
- `docs/tdx-dependency-flow.md`：记录 `:17709` 与 builtin realtime 两条独立链路。
- `tdx/builtin_bridge/README.md`：记录首次人工注册、自动运行、owner takeover 与
  Python 3.7+ 语法目标。
- `docs/references/tdxquant-live-datasource-smoke.md`：删除 `TDX_SDK_PATH` 和旧
  `/ws/quote` smoke，改为 backend-owned subscription。
- `docs/references/bigqmt-windows-runtime-probe-evidence-template.md`：明确它是复验模板，不是
  当前 pending 状态。

### `mist-deploy`

- `README.md`：中文当前入口、补齐 QMT WinSW service，并明确 terminal bridge
  lifecycle 不归 deploy 管理。
- `tdx-guard/README.md`：中文化并收敛 Docker、datasource、desktop、guard 四类
  操作边界。
- stable OpenSpec：删除已退役 TQ/queue metric 要求，补齐双 datasource gateway
  lifecycle 与 source-scoped realtime monitoring 约束。

### `mist-fe`

- `README.md`：Node/pnpm 要求改为 `22.13+ / 11.7+`，明确生产只使用 SHA image
  且 frontend 不直连 datasource。

### `mist-monitoring`

- root、Windows、Mac、contract README 改为中文当前部署模型。
- `docs/deploy-handoff.md` 从 future handoff 改为已落地的 deploy ownership。

### `mist-skills`

- `README.md` 与 `RUNBOOK.md` 改为中文。
- 生产 base URL 改为同源 gateway `http://www.moyui.mist/api/mist`，不再把固定 LAN
  IP 和 backend `:8001` 当作首选产品入口。

## 已检查且无需修改

- `mist/apps/chan/README.md`：已描述当前 Phase A/Phase B 算法与响应形状。
- `mist-fe` Chan fixture/设计文档：与当前两阶段渲染兼容。
- `mist-monitoring/docs/metrics.md`、`alerts.md`、`actions.md`：字段名仍与代码
  contract 一致；正式 realtime metric/API 命名已替代 active experimental 链路。
- `mist-datasource/docs/references/qmt-provider-alignment.md`：native bars、无 DAT、
  stdlib polling 与 mode-gated realtime 边界仍有效。
- `mist-skills/skills/*/SKILL.md`：API 均为 backend `/v1/*`，没有 datasource/raw
  provider 调用。

## 后续规则

1. 每次 production baseline 只更新当前 runbook 与 active roadmap evidence，不修改
   历史 archive。
2. Route、workflow 或 mode 发生变化时，同一提交同步更新 owner repo README 和
   `mist/docs/production-baseline-verification.md`。
3. 新运维文档默认中文；机器契约、源码标识与第三方原文不强制翻译。
4. 文档中的生产 URL 优先使用 gateway；直连端口只用于 host/loopback 诊断。
