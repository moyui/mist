## Context

四个仓库当前各自保存相同的 `contracts/realtime/realtime-native-frame-v1.json`，并通过 manifest 中的 SHA 验证跨仓 realtime frame 一致性。与此同时，`mist-monitoring/contracts` 还保存 metrics、alerts、actions 三份稳定维护文档。测试资产与产品文档共享同一个顶层目录，导致目录用途不明确；deploy 还需要针对旧路径单独维护 LF 规则。

本次是跨四仓的非运行时迁移。各仓必须继续支持独立 checkout 和独立 CI，不能依赖测试时联网下载另一个仓库的文件。

## Goals / Non-Goals

**Goals:**

- 删除四仓顶层 `contracts/`，把测试 fixture 与维护文档放回语义明确的位置。
- 保持 realtime golden fixture 字节不变，四仓 SHA 一致。
- 保持各仓测试独立、确定性运行。
- 更新当前维护中的路径引用并保留历史 archive 原样。

**Non-Goals:**

- 不修改 WS frame、provider native object、canonical 转换、eventTime、quality、sequence 或 fencing。
- 不调整 `TDX_REALTIME_MODE`、`QMT_REALTIME_MODE` 或生产发布配置。
- 不执行数据库 migration 或 Windows HIL。
- 不建立跨仓 package、Git submodule 或运行时文件依赖。

## Decisions

### 1. 使用各仓既有测试目录

- canonical：`mist/test/fixtures/realtime`
- datasource pinned copy：`mist-datasource/tests/fixtures/realtime`
- deploy pinned copy：`mist-deploy/scripts/fixtures/realtime`
- monitoring pinned copy：`mist-monitoring/tests/fixtures/realtime`

`mist` 负责 canonical fixture 的演进，consumer 仓通过相同 SHA 固定版本。相比只保留一个跨仓文件，该方案不要求 CI 同时 checkout 多仓或访问网络；相比继续使用顶层 `contracts/`，新路径明确表达这些文件仅为测试资产。

### 2. 用标准 `.sha256` sidecar 替代 manifest

每份 fixture 旁保存 `realtime-native-frame-v1.sha256`，内容采用 `<sha256>  realtime-native-frame-v1.json`。测试读取第一个 token 并同时计算 fixture SHA。consumer 清单属于 OpenSpec 与维护文档信息，不再复制到每个测试目录。

### 3. monitoring 稳定接口进入 `docs/`

`metrics.md`、`alerts.md`、`actions.md` 直接迁入 `mist-monitoring/docs/`。原 `contracts/README.md` 的稳定接口说明合并到当前 README 文档，不额外创建另一层 `contracts` 命名。测试继续校验文档覆盖和 package structure，但读取新位置。

### 4. archive 不做历史重写

只更新 active change、stable specs、当前 README/文档和可执行测试中的旧路径。`openspec/changes/archive/**` 中的历史 fixture 与引用保持不变。

## Risks / Trade-offs

- [Risk] consumer fixture 仍是复制文件，可能发生漂移 → 每仓 CI 校验 sidecar，跨仓验收再比较四份 fixture 与 sidecar SHA。
- [Risk] Windows checkout 改写换行导致 deploy SHA 失败 → 将 `.gitattributes` 的 `text eol=lf` 规则迁至新 fixture 路径，并同时覆盖 `.json` 与 `.sha256`。
- [Risk] 路径替换遗漏导致 CI 失败 → 使用 `rg` 排除 archive 后清点所有 `contracts/` 引用，并运行四仓针对性测试。
- [Trade-off] 不使用单一远端 artifact，保留少量受校验的文件复制，以换取仓库独立性和离线 CI。

## Migration Plan

1. 在 `mist` 移动 canonical fixture、增加 sidecar、更新 backend 测试与 active OpenSpec 引用。
2. 在 `mist-datasource`、`mist-deploy`、`mist-monitoring` 移动 pinned copy并更新测试；deploy 同步更新 `.gitattributes`。
3. 将 monitoring 稳定文档迁至 `docs/`，更新当前维护中的引用和 package tests。
4. 验证四份 fixture 字节与 sidecar 完全一致，确认 archive 外不存在顶层 `contracts/` 引用。
5. 依次运行 OpenSpec strict validation、四仓 targeted tests 和仓库级 lint/typecheck/tests 中受影响部分。

回滚只需反向移动文件并恢复测试路径；本次没有数据库、运行时配置或生产状态迁移。

## Open Questions

无。
