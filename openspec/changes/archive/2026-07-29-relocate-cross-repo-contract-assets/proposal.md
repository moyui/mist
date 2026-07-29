## Why

当前 `mist`、`mist-datasource`、`mist-deploy` 和 `mist-monitoring` 的顶层 `contracts/` 同时承载 realtime golden fixture 与 monitoring 稳定文档，目录语义混杂且增加跨仓维护成本。Theme B 继续扩展 realtime 契约前，应先把测试资产和维护文档迁回各自既有目录，同时保留独立 CI 所需的 pinned fixture 与 SHA 一致性校验。

## What Changes

- 移除四个仓库的顶层 `contracts/` 目录。
- 将 realtime golden fixture 迁入各仓既有测试 fixture 目录，并保持四份内容及 SHA 完全一致。
- 以 `mist/test/fixtures/realtime` 作为 canonical fixture 位置；其他仓库保留可独立运行 CI 的 pinned copy。
- 使用同目录 `.sha256` 文件替代重复的 `manifest.json`，简化跨语言校验并避免 JSON/CRLF 差异。
- 将 `mist-monitoring` 的 metrics、alerts、actions 稳定文档迁入 `docs/`，并更新当前维护中的引用。
- 保留 archive 中的历史文件和引用不变。
- 不修改 realtime WS frame、transport contract、sequence/fencing、启用模式或生产配置。

## Capabilities

### New Capabilities
- `cross-repo-contract-assets`: 规定跨仓 golden fixture 的 canonical/pinned 布局、SHA 校验、独立 CI 和维护文档归属。

### Modified Capabilities

无。

## Impact

- 影响仓库：`mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring`。
- 影响测试：backend contract spec、datasource unit tests、deploy PowerShell tests、monitoring contract/package tests。
- 影响文档：当前维护中的 OpenSpec 与 monitoring 文档链接；历史 archive 不修改。
- 不影响 API、数据库、前端、Windows datasource runtime 或生产发布配置。
