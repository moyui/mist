# Mist 规范中心

状态：Living index
适用范围：`mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring`、`mist-fe`、`mist-skills`

## 1. 目的

本目录是 Mist 开发规范的统一入口。它把日常开发流程、项目质量、公共契约、数据边界、运行时可靠性、
OpenSpec 和文档维护规则放在一个可检索的位置，同时避免把 feature-specific spec 复制成第二份产品契约。

本目录中的 guide 只总结跨功能、跨 change 仍然成立的长期规则。具体字段、API、provider 行为、算法、
状态机和部署拓扑仍以对应 stable OpenSpec、已确认的 active change、migration 和真实运行证据为准。

## 2. 规范优先级

发生冲突时按以下顺序处理：

1. 当前 stable OpenSpec 和已经逐项确认的 active OpenSpec change；
2. 已应用的 forward-only migration、生产 schema 与真实环境证据；
3. 当前分支代码、测试、OpenAPI、部署和监控契约；
4. 本目录及关联 living guide；
5. 归档 change、历史审计、旧设计稿和聊天记录。

guide 不得覆盖 owning spec，归档材料也不得反向恢复被 stable spec 删除的能力。

## 3. 文档导航

| 文档 | 什么时候读 | 主要内容 |
|---|---|---|
| [开发手册](development-handbook.md) | 开始任何开发、审查或交付任务 | 多仓范围、worktree、设计、实现、验证、提交、发布与归档流程 |
| [项目质量常驻治理指南](../project-quality-governance-guide.md) | 设计前、实现中和提交前必须校对 | OpenSpec 门禁、producer-to-consumer 影响链、数据库、跨仓验证和 HIL |
| [契约与数据治理指南](contract-and-data-governance-guide.md) | 修改 HTTP/RPC/WS、provider、字段、时间、精度或数据库时 | transport/domain/persistence 分层、命名、缺失值、migration 和 fixture |
| [运行时与可观测性治理指南](runtime-and-observability-governance-guide.md) | 新增 queue、worker、realtime、health、metrics、retry 或部署服务时 | 单一 owner、有界资源、故障隔离、readiness、低基数指标和发布证据 |
| [后端错误处理常驻治理指南](../backend-error-handling-governance-guide.md) | 修改 NestJS、TypeORM、HTTP/RPC、worker 或 realtime 错误路径时 | 错误分类、传播、边界日志、安全出口和 retry owner |
| [Mist Backend 代码风格指南](../mist-backend-code-style-guide.md) | 新增或实质修改 Backend DTO/VO/Entity/domain contract 时 | 命名、文件布局、HTTP/RPC 类型和受管 MySQL 对象命名 |
| [OpenSpec 与文档治理指南](openspec-and-documentation-governance-guide.md) | 创建、修改、同步或归档 spec，以及维护 living docs 时 | source of truth、change 生命周期、文档类型和规范提炼规则 |
| [OpenSpec 规范提炼映射](spec-derived-governance-map.md) | 判断某项 spec 是否应升格为长期 guide 时 | stable/active spec 家族的归类、已提炼项、候选项和保留项 |

运行手册、当前架构说明和 dated evidence 不属于本目录的长期规范：

- [生产基线验证](../production-baseline-verification.md)
- [Backend 与 Datasource 集成](../backend-datasource-integration.md)
- [实时策略信号交付链路](../realtime-strategy-signal-pipeline.md)
- [跨仓库文档盘点](../documentation-audit-2026-07-22.md)

## 4. 按任务选择最小文档集

| 任务类型 | 最少读取集合 |
|---|---|
| 普通内部重构 | 开发手册 + 项目质量 + 对应代码风格 |
| HTTP/RPC/WS 或跨仓字段 | 开发手册 + 项目质量 + 契约与数据 + owning spec/change |
| 数据库或 migration | 项目质量 + 契约与数据 + Backend 风格 + 生产 schema 证据 |
| Realtime、worker、queue、cache、retry | 项目质量 + 运行时与可观测性 + 错误治理 + owning spec/change |
| 部署、监控或生产验收 | 项目质量 + 运行时与可观测性 + 生产 runbook + owning spec/change |
| OpenSpec 或文档整理 | OpenSpec 与文档治理 + 规范提炼映射 + 对应 stable/active artifacts |

只读更多文档不能替代对当前 branch、HEAD、dirty status、migration 和实际代码的核验。

## 5. 目录边界

```text
docs/governance/
  README.md
  development-handbook.md
  contract-and-data-governance-guide.md
  runtime-and-observability-governance-guide.md
  openspec-and-documentation-governance-guide.md
  spec-derived-governance-map.md
```

三份既有 living guide 暂时保留在 `docs/` 根目录，因为 `AGENTS.md` 和 active OpenSpec 已引用其稳定路径。
本目录通过索引统一入口，不复制正文，避免出现两个可独立修改的版本。若未来迁移路径，必须在同一
change 中更新全部 active references、README、AI instructions 和相对链接。

## 6. 维护责任

- 新的跨项目治理结论先写入 owning stable spec 或已确认的 active change，再摘要进相应 guide。
- feature-specific 常量、字段或一次性迁移步骤留在 spec/change，不复制进通用 guide。
- active change 尚未归档的结论只能在提炼映射中标为候选，不得伪装成全局 stable 规则。
- 规则被替代时直接更新 owning guide，并在 active change 中说明 breaking impact 和迁移方式。
- 重大跨仓发布、数据库 migration 或 OpenSpec 批量归档后，复核本索引和提炼映射。
- 新写或实质重写的用户、开发者和运维文档默认使用简体中文；命令、API path、环境变量、protocol
  field、class 名称和外部产品名保持原文。
