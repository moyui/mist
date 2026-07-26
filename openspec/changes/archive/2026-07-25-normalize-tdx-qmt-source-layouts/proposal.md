## Why

TDX 与 QMT 的实时链路已经收敛到同一 native ingress contract，但两个 provider 在 backend 与 datasource 中仍保留不同历史阶段形成的目录、文件名和 experimental/spike 命名，增加了维护、验收和发布时误判链路的风险。Theme B 开始前需要先把两条正式链路整理成可对照、可守卫的结构，同时保留真实的 provider 能力差异。

## What Changes

- **BREAKING**：移除仓库内部旧模块路径与兼容 re-export，TDX/QMT 在各自 provider 目录内采用同名通用文件结构。
- backend 将 TDX/QMT 的 native-to-canonical 转换放回各自 source 边界，共享 ingress 仅接收 `CanonicalRealtimeSnapshot`。
- datasource 将 provider、realtime runtime/contract、route 与 dependency 组织成可逐项对照的目录；provider 独有能力继续保留专属模块。
- 将生产 QMT bridge 正式命名为 `mist_qmt_realtime_bridge.py`，并把 runtime probe 从生产 bridge 目录移至独立 tooling 目录。
- 清理当前文档、测试与配置中的 stale experimental/spike 命名，增加布局守卫测试。
- 不改变 realtime frame、HTTP/WS API、mode switch、allowlist、数据库 schema 或生产数据。

## Capabilities

### New Capabilities

- `realtime-source-layout`: 规定 backend 与 datasource 中 TDX/QMT 正式实时链路的对称目录、命名、边界和允许的 provider-specific 例外。

### Modified Capabilities

- `backend-datasource-integration`: 明确 source-specific native 转换发生在 backend source 边界，共享 ingress 只处理 canonical snapshot。
- `datasource-provider-contract`: 明确正式 bridge、runtime probe 与 provider package 的稳定身份和边界。

## Impact

- 影响 `mist/apps/mist/src/sources/{tdx,qmt}`、共享 realtime ingress 及相关测试。
- 影响 `mist-datasource/{tdx,qmt}` route、`src/datasource/{tdx,qmt}` provider/runtime、bridge、tooling、测试与当前维护文档。
- Windows 生产部署时需要分别手工覆盖 TDX 与 QMT bridge；本 change 只完成代码与本地验证，不执行生产部署或 HIL。
- 本 change 是 `align-realtime-native-ingress-contracts` 剩余 Windows HIL/release tasks 的前置整理。
