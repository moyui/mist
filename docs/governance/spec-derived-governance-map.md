# Mist OpenSpec 规范提炼映射

状态：Living inventory
基线：本地 `master` `f79412045436b990b0d89ff96cb7c79c914649c8`，2026-08-28

## 1. 目的

本映射回答两个问题：

1. 哪些 stable/active OpenSpec 内容适合沉淀为跨项目开发规范；
2. 哪些内容必须继续只由 owning spec 管理，避免形成重复或过早稳定的契约。

本文件不记录 task 完成比例；状态变化以 `openspec list --json` 和对应 artifacts 为准。

## 2. 已由现有 guide 承接

| Spec 家族 | 可复用规则 | 当前 owner 文档 |
|---|---|---|
| `database-schema-safety`、`managed-database-column-naming`、`audit-timestamp-contract` | forward-only migration、metadata 对齐、审计时间和物理命名 | [项目质量指南](../project-quality-governance-guide.md)、[Backend 风格](../mist-backend-code-style-guide.md) |
| `service-boundary-contracts` | HTTP/RPC envelope、status/code、request/correlation identity | [Backend 风格](../mist-backend-code-style-guide.md)、[错误治理](../backend-error-handling-governance-guide.md) |
| `review-remediation-governance`、`repository-cleanup` | bounded batch、用户工作保护、证据映射和删除门禁 | [项目质量指南](../project-quality-governance-guide.md)、[开发手册](development-handbook.md) |
| `cross-repo-naming-governance`、`realtime-source-layout` | 生命周期词汇、文件职责、provider 对齐但不强制对称 | [项目质量指南](../project-quality-governance-guide.md)、[Backend 风格](../mist-backend-code-style-guide.md) |
| `k-line-persistence-integrity`、`datasource-provider-contract` | 缺失值、finite/exact、provider 边界和 partial-result fail closed | [项目质量指南](../project-quality-governance-guide.md)、[错误治理](../backend-error-handling-governance-guide.md) |

## 3. 本轮新提炼的规范

| 来源 stable specs | 提炼结果 | 进入文档 |
|---|---|---|
| `service-boundary-contracts`、`http-envelope-consumers` | producer 与 consumer 共同遵守统一 envelope；malformed/rejection/network 分层 | [契约与数据治理](contract-and-data-governance-guide.md) |
| `security-code-identity`、`audit-timestamp-contract`、`cross-repo-naming-governance` | identity、time、readiness 的固定词汇和边界 | [契约与数据治理](contract-and-data-governance-guide.md) |
| `database-schema-safety`、`managed-database-column-naming`、`k-line-persistence-integrity` | migration、physical schema、missing/zero/exact decimal 的统一门禁 | [契约与数据治理](contract-and-data-governance-guide.md) |
| `cross-repo-contract-assets` | canonical fixture、pinned copy、`.sha256` 和 archive preservation | [契约与数据治理](contract-and-data-governance-guide.md) |
| `datasource-runtime-safety`、`realtime-market-data-ingress` | bounded parse、single validation、fault isolation、side-effect ownership | [运行时与可观测性](runtime-and-observability-governance-guide.md) |
| `monitoring-health-alerts` | health 分层、低基数 label、直接观察而非跨层推断 | [运行时与可观测性](runtime-and-observability-governance-guide.md) |
| `strategy-runtime-architecture` | 单一 owner、market→analysis→evaluation→delivery 单向依赖、先 library 后 repo split | [运行时与可观测性](runtime-and-observability-governance-guide.md) |
| `release-ci-safety`、`mist-production-baseline`、`windows-docker-appliance` | validation、protected environment、artifact identity、rollback 与 HIL 证据 | [运行时与可观测性](runtime-and-observability-governance-guide.md) |
| `repository-cleanup`、`review-remediation-governance` | 独立仓盘点、bounded batch、用户工作保护、traceable evidence | [开发手册](development-handbook.md) |
| `strategy-platform-roadmap` 与 living roadmap change | dependency gate、child independence 和 disposition ledger | [OpenSpec 与文档治理](openspec-and-documentation-governance-guide.md) |

## 4. Active change 中的候选规则

下列内容有跨 change 价值，但在 owning change 归档前不提升为无条件全局规则：

| Active change | 候选规则 | 处置 |
|---|---|---|
| `complete-current-day-realtime-candles` | 上游 market commit 与下游 strategy 隔离；state/queue/record 按 count/age/bytes 有界；exact decimal unit profile | 当前 guide 只记录通用原则；具体 grace、Redis identity、retention 和单位 profile 留在 change |
| `capture-realtime-provider-anomalies` | `observed/not-observed/unknown` 证据分类；真实 incident 不以 production fault hook 制造 | 归档后评估补入运行时 HIL/evidence 章节 |
| `evolve-strategy-evaluation-contract` | runtime-neutral evaluator、finite-demand field catalog、raw fact 与 effective projection 分离 | 主要是 strategy domain 规范；归档后仅提炼跨 runtime 的边界方法，不复制字段和算法 |
| `extract-backtest-runtime` | app 不互相 import internal source；bounded keyset replay；task boundary 失败收口 | 通用部分已在开发/运行时 guide 表达，page size、RPC pattern、run 状态留在 change |
| `run-realtime-strategy-evaluation` | sealed fact 与 queue failure 隔离；worker state 单一 owner；deadline/retry/retention 明确 | 通用部分已表达；queue/prefix/timeout/app port 等保持 change-local |
| `deliver-strategy-notifications` | notification 只消费 persisted event；delivery status 与 operator acknowledgement 分离 | 保持策略通知领域规范；归档后只把独立 failure domain 补入运行时 guide |
| `define-mist-production-roadmap` | gate-driven roadmap、disposition ledger、child change 独立归档 | 已作为文档治理方法记录；具体 G0–G4 状态仍只在 roadmap change 维护 |

## 5. 继续只由 feature spec 管理

以下家族包含稳定产品语义，但不应改写为全项目开发规范：

| 家族 | Specs | 原因 |
|---|---|---|
| Chan 算法与展示 | `chan-analysis-*`、`chan-bi-*`、`chan-channel-phase-preview`、`chan-derived-analysis-lifecycle` | 算法不变量、phase contract 和 UI/API 形状属于 Chan capability |
| 策略产品 | `strategy-definition-registry`、`strategy-operator-ux`、`strategy-signal-alerts`、`strategy-signal-backtesting`、`strategy-scheduler-alert-delivery` | 版本、规则、信号、告警、回测与 acknowledgement 是业务 contract |
| Provider 能力 | `bigqmt-datasource-bridge`、`qmt-native-subscription-transport`、`tdx-interface-coverage`、`tdx-provider-boundaries` | native method、callback、journal、handle 和能力矩阵具有 provider-specific 语义 |
| 产品集成 | `astrbot-integration`、`backend-datasource-integration`、`frontend-live-kline-viewer` | API/页面/Skills 路径和交互属于具体集成能力 |
| 部署产品形状 | `backend-container-image`、`frontend-image-deployment`、`datasource-container-deployment`、`tdx-desktop-guard` | image/service/guard 的现行要求应留在部署 spec 和 runbook |
| API 路由 | `mist-api-path-standardization` | version-first 与 gateway 原则已摘要，具体 route/alias 仍由 stable spec 管理 |

## 6. 历史 remediation spec 的处理

`review-p1-*`、`review-p2-*`、`review-p3-*`、`cross-repo-redundancy-pruning` 和类似 remediation specs
主要用于证明某批 findings 如何关闭。其通用方法已经提炼为：

- 明确 inventory/source ledger；
- focused bounded batch；
- item → changed files → verification 的可追溯映射；
- 保留生产边界与用户工作；
- 定向验证不能冒充完整基线。

具体 finding、文件名和已完成证据继续留在 stable/archive，不建立对应长期 guide。

## 7. 暂不提炼与边界

- 仍在逐项评审的 schema、provider unit、retry/dead-letter、兼容和 HIL 决策不得提前写成规范。
- task 数量、branch、worktree、deployment snapshot 和 dated test count 不进入 living guide。
- 已归档 evidence 保留历史原文和路径，不为当前术语一致性追溯改写。
- 本轮 33 个 `TBD - created by archiving change ...` 的 stable spec Purpose 已于 2026-08-28
  按 owning change 真实语义一次性回填（见 §2 来历），`grep -r "TBD - created" openspec/specs` 当前为 0。

## 8. 后续复核触发点

出现以下任一事件时更新本映射：

- active change 归档并同步 stable spec；
- 新增跨两个以上 capability 的重复 review rule；
- database migration 或跨仓 breaking contract 发布；
- runtime owner、deployment topology 或 HIL 标准变化；
- living guide 与 stable spec 出现冲突或重复。
