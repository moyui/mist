# Mist 文档编写指南

状态：Living guide
适用范围：`mist`、`mist-fe`、`mist-datasource`、`mist-deploy`、`mist-skills`、`zcode-cpu-guard`、`opencode-retry-proxy`，以及 workspace 根 `mist/README.md`
适用对象：开发者、审查者与 AI Agent

本指南把本轮 README 统一改动收敛为可执行的文档编写规范，覆盖 README 结构、双语、Badge、远端 About、检查与发布。你所在仓库无论是 `mist` 还是 `zcode-cpu-guard`，都以本文件为 canonical 入口；其余 6 个仓库的 `CONTRIBUTING.md` 仅作轻量指针，不复制正文。

规范中心与其他治理的优先级见 [规范中心 README](./README.md)；若与 stable OpenSpec 或已应用 migration 冲突，以 spec/migration/生产证据为准。

---

## 1. 适用范围与放置

| 位置 | 作用 | 何时修改 |
|------|------|----------|
| `mist/docs/governance/documentation-guide.md`（本文） | 跨仓文档编写的唯一真相 | 本节所述规则变更时 |
| `mist/docs/governance/README.md` | 规范中心索引，本指南的入口 | 新增或重命名 living guide 时 |
| `mist/docs/readme-governance/` | 本轮统一的工具产物（模板骨架、同步脚本、清单） | README 模板或远端规范变更时 |
| 各仓 `CONTRIBUTING.md` | 指向本文的轻量指针 + 1–3 条本仓特殊注意 | 本仓有特殊文档约束时 |
| `openspec/specs/` 与 active `openspec/changes/` | 产品/运行契约的真相 | 字段、API、部署等契约变更时 |

`zcode-cpu-guard` 与 `opencode-retry-proxy`（`moyui` 组织）同样遵循本文；其独立性仅体现在远端 About 与 License，不影响 README 结构与双语规则。

---

## 2. 语言

- 新写或实质重写的用户、开发者、运维文档默认使用简体中文（与 `openspec-and-documentation-governance-guide.md` §8.1 一致）。
- 命令、`API path`、环境变量、protocol field、`class` 名、外部产品名保持原文，不翻译。
- 归档 evidence 与 dated audit 不追溯翻译。

---

## 3. README 双语

每个仓库同时提供两份 README，构成一组：

| 文件 | 作用 | 顶部互跳 |
|------|------|----------|
| `README.md` | 英文主文档，GitHub 默认展示 | `<p align="right"><a href="./README.zh-CN.md">中文</a> \| <strong>English</strong></p>` |
| `README.zh-CN.md` | 中文面向国内读者 | `<p align="right"><strong>中文</strong> \| <a href="./README.md">English</a></p>` |

与 `opencode-retry-proxy` 已有实现保持一致。两份文件语义一致，中文可更详细；英文为精炼版但必须包含 Why / Quick start / Env（如适用）/ How it works（如适用）/ License。

新增或重写 README 时，以 `mist/docs/readme-governance/templates/` 下的骨架为起点，不得手写顶部互跳或遗漏其中一份。

---

## 4. Badge

- 位置：标题下一行，`<p align="left">` 包裹；与现有 `mist` / `opencode-retry-proxy` 保持一致。
- 来源：`shields.io`，风格 `badgeName-value-color.svg`。
- 顺序：`Runtime | Package Manager | Framework | License`，例如 `Node / pnpm / NestJS / License`。
- workspace 根 `mist/README.md` 额外标注多仓属性；`zcode-cpu-guard` 补充 `Platform: macOS (Intel)` 与 `License: MIT`。

---

## 5. 章节顺序（固定顺序，必选/可选）

二级标题用 `##`，三级标题用 `###`。Emoji 仅使用已有集合 `🌟 🏛️ 🔄 📋 🚀 🧪 🚢 📚 📄 🔒`，不新增种类。

| 序号 | 章节（中 / 英） | 必选 | 说明 |
|------|------------------|------|------|
| 0 | 顶部互跳 + Title + Badges + 一句话简介 | 必选 | 英文一句话 ≤120 字符，见 §6 |
| 1 | Why / 为什么需要它 | 必选 | 痛点、适用与不适用边界（例如 `zcode` 的 Intel-only） |
| 2 | 核心特性 / Features | 必选 | 3–7 条要点，不复制 spec 全文 |
| 3 | 架构与数据链路 / Architecture & Topology | 按需 | `mist` 系列必选，工具类可选（原理图） |
| 4 | 环境与依赖 / Requirements | 必选 | Node / Python / `uv` / 系统要求 |
| 5 | 快速上手 / Quick Start | 必选 | 安装 + 最小可跑命令，`pnpm` / `uv` / `cpulimit` 等以仓库实际为准 |
| 6 | 环境变量 / Env Vars | 工具类必选 | 表格：变量 / 默认值 / 说明 |
| 7 | 工作原理 / How it Works | 按需 | 代理、数据源等需解释机制时必选 |
| 8 | 测试与质量门禁 / Testing & Quality Gate | 必选 | 单仓测试与门禁命令（`TZ=UTC`、`ruff`/`pyright` 等按仓而定） |
| 9 | 生产部署 / Deploy | 按需 | `mist` 系列必选，指向 `mist-deploy` 工作流或本仓部署方式 |
| 10 | 目录索引 / Directory Index | 可选 | 子模块链接 |
| 11 | 安全与隐私 / Security & Privacy | 工具类必选 | 绑定地址、鉴权转发、日志脱敏 |
| 12 | 许可证 / License | 必选 | `BSD-3-Clause` / `MIT` / 私有保留，见 §7 |

结构以保留业务准确性为前提，仅做章节顺序与文案统一，不为对齐而改动业务事实。

---

## 6. 远端 About（GitHub 仓库页右侧）

About 的 `description` / `topics` / `homepage` / Social Preview 由 `mist/docs/readme-governance/` 下的清单与脚本统一管理，不手改网页。

### 6.1 description

- 英文一句话，≤120 字符，包含关键词（`A-share` / `chan-theory` / `proxy` / `cpulimit` 等）。
- 示例：`zcode-cpu-guard — Limit ZCode CPU usage on Intel MacBooks to prevent VRM thermal throttling.`

### 6.2 topics（每仓 5–10 个）

- 组织与领域：`mist-trade` 相关加 `quant` / `a-shares`；领域如 `chan-theory` / `ta-lib` / `realtime` / `strategy` / `datasource`。
- 技术栈：`nestjs` / `nextjs` / `fastapi` / `python` / `nodejs` 等。
- 工具类：`macos` / `intel` / `cpulimit` / `proxy` / `self-healing` 等。

### 6.3 homepage 与 Social Preview

- `homepage` 指向本仓库 URL 或 docs 页（`mist` 系列可用 `https://github.com/mist-trade/mist`，工具类指向自身）。
- Social Preview 建议 1280×640，不在本文固定图片。

### 6.4 推荐值与同步脚本

- 推荐值（TSV 优先，CSV 兼容）：`mist/docs/readme-governance/github-about.tsv` / `github-about.csv`，表头 `repo / description / homepage / topics`（`topics` 以 `;` 分隔）。
- 同步脚本：`mist/docs/readme-governance/sync-github-about.sh`，默认 dry-run 打印 `gh repo edit` 预览，`--apply` 才写入；`mist-deploy` 为 `PRIVATE`，脚本已兼容 `visibility` 回退。
- 执行前需二次确认；需 `gh auth login` 且有 `repo` 权限。

当前 7 仓推荐值（与脚本一致）：

| 仓库 | description (EN) | topics |
|------|-------------------|--------|
| `mist-trade/mist` | A-share quantitative engine: realtime 1m candles, Chan Theory, strategy & backtest (NestJS) | `quant`, `a-shares`, `nestjs`, `chan-theory`, `trading`, `backtest`, `ta-lib`, `realtime` |
| `mist-trade/mist-fe` | A-share visual trading desk: K-line & Chan geometry with Next.js + lightweight-charts | `nextjs`, `trading`, `kline`, `chan-theory`, `lightweight-charts`, `visualization` |
| `mist-trade/mist-datasource` | TDX/QMT terminal bridge: HTTP + WebSocket gateway over schema-v2 frames (FastAPI) | `fastapi`, `datasource`, `tdx`, `qmt`, `websocket`, `gateway` |
| `mist-trade/mist-deploy` | Windows Docker appliance for Mist stack: deploy, backup, guards & observability | `docker`, `windows`, `deploy`, `observability`, `openobserve` |
| `mist-trade/mist-skills` | LLM/Agent skills for Mist: Chan/indicators/query/alerts (AstrBot) | `llm`, `agent-skills`, `astrbot`, `quant` |
| `moyui/zcode-cpu-guard` | Limit ZCode CPU on Intel MacBooks to prevent thermal throttling | `macos`, `intel`, `cpulimit`, `electron`, `thermal` |
| `moyui/opencode-retry-proxy` | Transparent retry proxy for opencode.ai Responses API previous_response_id expiry | `nodejs`, `proxy`, `reasonix`, `responses-api`, `retry`, `self-healing`（已满足） |

---

## 7. 许可证表述

| 仓库 | 许可证 | README 表述 |
|------|--------|-------------|
| `mist`、`mist-datasource`、`mist-deploy`、`mist-skills`、workspace 根 | `BSD-3-Clause` | `本项目遵循 [BSD-3-Clause](https://opensource.org/licenses/BSD-3-Clause) 开源许可证。` |
| `mist-fe` | 私有，保留所有权利 | `本项目为私有量化系统核心组件，保留所有权利。`（与 `package.json: private` 一致） |
| `zcode-cpu-guard`、`opencode-retry-proxy` | `MIT` | `MIT © <holder> — see [LICENSE](./LICENSE).` |

不得在 README 中虚构 `LICENSE` 文件路径；表述与仓库根 `LICENSE` / `package.json` 保持一致。

---

## 5.1 子 README 规范（`apps/*` / `libs/*` 模块级）

`mist` 仓内 `apps/` 与 `libs/` 下共有 13 份子 README（`apps/mist|chan|schedule|signal|backtest|notification|realtime-subscription-hil` 7 份 + `libs/chancore|indicators|realtime|shared-data|signal|strategy` 6 份）。它们为模块级文档，不套用 §5 的仓库 13 节模板，遵循本节专属规范。

### 适用与语言

- 适用路径：`mist/apps/*/README.md`、`mist/libs/*/README.md`（当前 13 份，新增模块沿用）。
- 语言：保持中文单语，不做 `README.zh-CN.md` 双语（避免 26 份的维护量）；命令、`API path`、`class` 名等标识符保持原文。
- 顶部：在首个 `#` 标题后加一行返回链接：`> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](./../../docs/governance/documentation-guide.md)`（相对路径以模块所在层级为准，`apps/mist` 为 `../../`，`libs/chancore` 为 `../../`，`apps/realtime-subscription-hil` 为 `../../`，以此类推）。

### 固定 5 节顺序

二级标题用 `##`，`Emoji` 固定为现有集合，顺序与标题写法如下（标题后缀与示例严格一致）：

| 序号 | 标题 | 必选 | 说明 |
|------|------|------|------|
| 1 | `## 🎯 模块职责` | 必选 | 1–3 段说明模块在 `mist` 中的职责，不复制 `openspec` 全文 |
| 2 | `## 🔌 核心接口与路由` / `## 🔌 核心导出品与 API` / `## 🔌 核心接口与协议` 等 | 必选 | `apps` 用“路由/协议/调度机制”，`libs` 用“导出品与 API / 实体列表 / Key 格式”，以现有 13 份的表述为准；表格或代码块列出 `GET /v1/...`、`import { ... } from '@app/...'` 等 |
| 3 | `## 📂 关键文件速查` | 必选 | 2–4 行 `src/...` 路径与职责，避免列出已删除或重命名文件 |
| 4 | `## 🛠️ 专属调试与测试` / `## 🛠️ 专属测试` / `## 🛠️ 专属执行命令` | 必选 | 仅写本模块可直接执行的 `pnpm run test -- apps/...` / `pnpm exec nest start ...` / `pnpm run test -- libs/...` 命令，不写全仓通用门禁 |
| 5 | `## 🔗 上下游边界` / `## 🔗 边界说明` | 必选 | 明确依赖（`libs/...`、`mist-datasource` 等）与消费方（`apps/signal`、`mist-fe` 等），与 `project-quality-governance-guide.md` 的影响链保持一致 |

结构以保留业务准确性为前提，仅做章节标题与顺序统一，不为对齐而改动业务事实。新增子模块从现有 13 份中挑最近似的一份复制骨架。

### 检查（子 README 提交前）

- [ ] 顶部返回链接可达（`../../README.zh-CN.md` 与 `../../docs/governance/documentation-guide.md`）。
- [ ] 5 节标题与顺序符合本节，`Emoji` 未新增种类。
- [ ] `关键文件速查` 中的路径在当前 `HEAD` 存在；`专属调试与测试` 的命令可直接执行。
- [ ] `上下游边界` 与实际依赖一致，未虚构已删除的 `app`/`lib`。

## 8. 模板与工具产物

| 产物 | 路径 | 用途 |
|------|------|------|
| 英文骨架 | `mist/docs/readme-governance/templates/README.md.skeleton` | 新仓英文 README 起点 |
| 中文骨架 | `mist/docs/readme-governance/templates/README.zh-CN.md.skeleton` | 新仓中文 README 起点 |
| 模板规范 | `mist/docs/readme-governance/README-template-spec.md` | 13 节详细定义（本文的展开版） |
| 清单 | `mist/docs/readme-governance/github-about.tsv` / `.csv` | 远端推荐值 |
| 脚本 | `mist/docs/readme-governance/sync-github-about.sh` | 远端同步（dry-run 默认） |

新增仓库时，从 skeleton 起步；已有仓库改动 README 时，对照本文 §3–§5 自检。

---

## 9. 检查（提交前）

提交前至少完成以下检查（对应 `openspec-and-documentation-governance-guide.md` §8.3 的链接与路径要求）：

- [ ] `README.md` 与 `README.zh-CN.md` 成对存在，顶部互跳链接有效（`README.md` 含 `README.zh-CN.md`，反之亦然）。
- [ ] Badge 在标题下一行、`<p align="left">` 内，顺序符合 §4。
- [ ] 章节顺序符合 §5，未为对齐而改动业务事实；相对链接（`./apps/...`、`./docs/...`、`./LICENSE`）可达。
- [ ] 远端 About 如有变更，已更新 `github-about.tsv` 并通过 `sync-github-about.sh`（dry-run）预览，执行前已二次确认。
- [ ] 许可证表述与 `LICENSE` / `package.json` 一致（§7）。

可选 CI 门禁（防回归），在各仓 `.github/workflows/ci.yml` 增加：

```yaml
- name: Check bilingual README
  run: |
    test -f README.md || (echo "README.md missing" && exit 1)
    test -f README.zh-CN.md || (echo "README.zh-CN.md missing" && exit 1)
    grep -q "README.zh-CN.md" README.md || (echo "EN missing zh link" && exit 1)
    grep -q "README.md" README.zh-CN.md || (echo "ZH missing en link" && exit 1)
```

或在 workspace 根增加 `scripts/check-readme-bilingual.sh` 批量校验 7 仓。

---

## 10. 文档类型边界

- **Living guide（本文与 `docs/governance/`）**：只记录当前规则，不累计日期化执行记录；规则变更直接更新本文。
- **Runbook / 手册**：只保留当前可执行命令；旧命令进 dated evidence / `archive`。
- **Dated audit / evidence**：保留当时 `branch` / `SHA` / 结论，不追溯改写为当前状态。
- **Stable spec / active change**：产品与运行契约的真相；文档不得与之冲突，冲突时以 spec 为准（见 [规范中心](./README.md) §2）。

---

## 11. 维护责任

- 新的跨项目文档结论先写入 owning stable spec 或已确认的 active change，再摘要进本文；本文不作为绕过 OpenSpec 的审批入口。
- 规则被替代时直接更新本文，并在 active change 中说明 breaking impact 与迁移方式。
- 路径迁移（例如 `docs/readme-governance/` 移动）必须在同一 change 中同步更新全部 `CONTRIBUTING.md`、`README.md`、OpenSpec、`AGENTS.md` 与 AI instructions。
- 重大跨仓发布、数据库 migration 或 OpenSpec 批量归档后，复核本指南与 [规范提炼映射](./spec-derived-governance-map.md)。
