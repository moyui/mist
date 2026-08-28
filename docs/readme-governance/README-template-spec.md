# README 统一模板规范

> 落盘于 `/Users/moyui/sean/mist/docs/README-template-spec.md` 的预览版（计划执行阶段再正式落盘到 mist 仓）。
> 本文件定义 7 个仓库 README 的统一章节顺序、Badge 规范、双语结构与远端 About 规范。

## 1. 双语结构

- 每个仓库同时提供 `README.md`（英文，GitHub 默认展示）与 `README.zh-CN.md`（中文）。
- 顶部右侧互跳（与 `opencode-retry-proxy` 已有实现一致）：
  - `README.md` 顶部：`<p align="right"><a href="./README.zh-CN.md">中文</a> | <strong>English</strong></p>`
  - `README.zh-CN.md` 顶部：`<p align="right"><strong>中文</strong> | <a href="./README.md">English</a></p>`
- 中英内容语义一致，中文可更详细，英文为精炼版（至少包含 Why/Quick start/Env/How it works/License）。

## 2. Badge 规范

- 位置：标题下一行，`<p align="left">` 包裹。
- 来源：shields.io，保持现有风格（`badgeName-value-color.svg`）。
- 顺序：`Runtime | Package Manager | Framework | License`（示例：Node / pnpm / NestJS / License）。
- workspace 根 README 额外标注 `多仓库` 标识。
- zcode-cpu-guard 补充：`Platform: macOS (Intel)`, `License: MIT`。

## 3. 章节顺序（必选/可选）

| 序号 | 章节标题（中/英） | 必选 | 说明 |
|------|-------------------|------|------|
| 0 | 顶部互跳 + Title + Badges + 一句话简介 | 必选 | 英文一句话 ≤120 字符 |
| 1 | Why / 为什么需要它 | 必选 | 痛点 + 适用/不适用边界 |
| 2 | 核心特性 / Features | 必选 | 3-7 条要点 |
| 3 | 架构与数据链路 / Architecture & Topology | 按需 | mist 系列必选，工具类可选（原理图） |
| 4 | 环境与依赖 / Requirements | 必选 | Node/Python/uv/系统要求 |
| 5 | 快速上手 / Quick Start | 必选 | 安装 + 最小可跑命令 |
| 6 | 环境变量 / Env Vars | 工具类必选 | 表格：变量/默认值/说明 |
| 7 | 工作原理 / How it Works | 按需 | 代理/数据源等需要解释时必选 |
| 8 | 测试与质量门禁 / Testing & Quality Gate | 必选 | 单仓测试与门禁命令 |
| 9 | 生产部署 / Deploy | 按需 | mist 系列必选 |
| 10 | 目录索引 / Directory Index | 可选 | 子模块链接 |
| 11 | 安全与隐私 / Security & Privacy | 工具类必选 | 绑定地址/鉴权/日志 |
| 12 | 许可证 / License | 必选 | BSD-3-Clause / MIT / 私有保留 |

**固定写法**：二级标题用 `##`，三级标题用 `###`；Emoji 仅允许 `🌟 🏛️ 🔄 📋 🚀 🧪 🚢 📚 📄 🔒` 等已用集合，不新增。

## 4. 远端 About 规范

### 4.1 description

- 英文一句话，≤120 字符，包含关键词（A-share / chan-theory / proxy / cpulimit 等）。
- 示例：`zcode-cpu-guard: Limit ZCode CPU usage on Intel MacBooks to prevent VRM thermal throttling.`

### 4.2 topics（每仓 5-10 个）

- 组织前缀：`mist-trade` 相关仓加 `quant`/`a-shares`。
- 技术栈：`nestjs`/`nextjs`/`fastapi`/`python`/`nodejs` 等。
- 领域：`chan-theory`/`ta-lib`/`realtime`/`strategy`/`datasource` 等。
- 工具类：`macos`/`intel`/`cpulimit`/`proxy`/`self-healing` 等。

### 4.3 homepage

- mist 系列：`https://github.com/mist-trade/mist`（或 docs 链接）。
- zcode/opencode：本仓库 URL 或文档页。

### 4.4 推荐值草案

| 仓库 | 推荐 description (EN) | 推荐 topics |
|------|------------------------|-------------|
| mist-trade/mist | A-share quantitative engine: realtime 1m candles, Chan Theory, strategy & backtest (NestJS) | `quant`, `a-shares`, `nestjs`, `chan-theory`, `trading`, `backtest`, `ta-lib`, `realtime` |
| mist-trade/mist-fe | A-share visual trading desk: K-line & Chan geometry with Next.js + lightweight-charts | `nextjs`, `trading`, `kline`, `chan-theory`, `lightweight-charts`, `visualization` |
| mist-trade/mist-datasource | TDX/QMT terminal bridge: HTTP + WebSocket gateway over schema-v2 frames (FastAPI) | `fastapi`, `datasource`, `tdx`, `qmt`, `websocket`, `gateway` |
| mist-trade/mist-deploy | Windows Docker appliance for Mist stack: deploy, backup, guards & observability | `docker`, `windows`, `deploy`, `observability`, `openobserve` |
| mist-trade/mist-skills | LLM/Agent skills for Mist: Chan/indicators/query/alerts (AstrBot) | `llm`, `agent-skills`, `astrbot`, `quant` |
| moyui/zcode-cpu-guard | Limit ZCode CPU on Intel MacBooks to prevent thermal throttling | `macos`, `intel`, `cpulimit`, `electron`, `thermal` |
| moyui/opencode-retry-proxy | Transparent retry proxy for opencode.ai Responses API previous_response_id expiry | `nodejs`, `proxy`, `reasonix`, `responses-api`, `retry`, `self-healing` (已满足) |

## 5. 本轮落地清单

- [x] 为 6 个缺失中文版的仓库新增 `README.zh-CN.md`（含 workspace）
- [x] 为 `zcode-cpu-guard` 补充 Badge 与顶部互跳
- [x] 为 `mist` workspace 根补充双语与互跳
- [x] 统一 7 仓现有 `README.md` 顶部双语化（业务正文保持原状，英文首段补充一句话简介）
- [x] 交付 `sync-github-about.sh` + `github-about.csv` + `github-about.tsv`（TSV 优先，CSV 兼容）

## 6. 可选 CI 门禁（防回归）

在各仓库 `.github/workflows/ci.yml` 增加：

```yaml
- name: Check bilingual README
  run: |
    test -f README.md || (echo "README.md missing" && exit 1)
    test -f README.zh-CN.md || (echo "README.zh-CN.md missing" && exit 1)
    grep -q "README.zh-CN.md" README.md || (echo "EN missing zh link" && exit 1)
    grep -q "README.md" README.zh-CN.md || (echo "ZH missing en link" && exit 1)
```

或在根 workspace 增加 `scripts/check-readme-bilingual.sh` 批量校验 7 仓。
