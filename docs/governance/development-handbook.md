# Mist 开发手册

状态：Living guide
适用对象：开发者、审查者、运维人员和参与 Mist 开发的 AI

## 1. 使用方式

本手册描述一次 Mist 变更从接单到归档的标准路径。细节规则由
[规范中心](README.md)中的专题 guide 和 owning OpenSpec 管理；本手册不重复业务字段、算法或部署常量。

## 2. 多仓工作区

`/Users/moyui/sean/mist` 是工作区父目录，不是 Git 仓库。每个子目录必须独立记录 branch、HEAD 和
dirty status：

| 仓库 | 主要职责 | 常见验证入口 |
|---|---|---|
| `mist` | NestJS apps、shared libs、MySQL migrations、OpenSpec | pnpm、Jest、contracts、OpenSpec |
| `mist-datasource` | TDX/QMT provider gateway、HTTP/WS、terminal bridge | uv、pytest、ruff、pyright、OpenAPI |
| `mist-deploy` | Windows Docker appliance、PowerShell 运维与发布 | `pwsh-preview`、Compose/Pester contract tests |
| `mist-monitoring` | exporter、watchdog、metrics 和 alerts | Go/Python tests、metric contract tests |
| `mist-fe` | Next.js frontend | lint、typecheck、unit tests、production build |
| `mist-skills` | Skills/AstrBot consumer | uv quality gates、contract tests |

不得在父目录执行 Git/OpenSpec 命令并把失败误判成仓库问题。OpenSpec planning authority 位于
`mist/openspec`。

## 3. 开始前的只读基线

任何非简单文档或注释修改开始前，记录：

- 涉及的 repository、branch、HEAD、remote tracking；
- dirty/untracked 文件和关联 worktree；
- stable specs、active changes、migration 与生产 runbook；
- 是否需要真实 MySQL、Windows terminal、交易时段或外部渠道证据；
- 用户已经确认、明确延期和仍需讨论的决策。

存在预先修改或 untracked 用户文件时，默认属于用户。不得覆盖、清理、reset、stash 或吸收进当前
change，除非用户明确授权。

### 3.1 分支与 worktree

- 复杂或独立主题优先使用基于已核实目标 SHA 的独立 worktree。
- 一个 worktree 只承担一个主要交付主题；不要把另一个未提交 change 顺手带入。
- 创建 worktree 前检查目标 branch 是否已被其他 worktree 占用。
- 不以 cherry-pick 成功、branch clean 或 commit 存在作为集成完成证据。
- 用户明确授权直接在 `master` 工作时可以照做，但仍要单独报告 local commit 与 remote push 状态。

## 4. 判断是否需要 OpenSpec

以下变更先创建或更新 OpenSpec，再实施：

- HTTP、RPC、WebSocket、OpenAPI、跨仓 JSON path、环境变量或 metric contract；
- 数据库表、列、索引、约束、nullability、precision、migration 或数据 owner；
- provider 语义、数据来源、权威性、持久化或恢复策略；
- 新 app/worker/queue、leader、generation、retry、dead-letter 或自动恢复；
- 部署拓扑、terminal bridge、Compose service、发布或回滚顺序；
- 曾经可达路径的删除、模块 owner 改变或多个仓库必须匹配发布。

不改变外部契约的内部重构、稳定 spec 已明确授权的局部实现、测试和非语义文档修复通常不需要
新 change，但必须遵守验证与用户工作保护规则。

详细门禁见[项目质量常驻治理指南](../project-quality-governance-guide.md)和
[OpenSpec 与文档治理指南](openspec-and-documentation-governance-guide.md)。

## 5. 设计：先建立完整影响链

每个公共或持久化数据变化都要先画出：

```text
producer
  → wire / generated contract
  → decoder / adapter
  → canonical state / persistence
  → business consumer
  → deploy / monitoring / recovery
```

对每一层记录 owner、输入、输出、失败、容量、清理和验证。只修改 producer 或单仓 consumer 不代表
链路完成。

以下情况必须暂停并与项目负责人讨论：

- provider 字段的含义、单位、时间、复权或缺失语义没有真实样本；
- 数据库字段删除、改名、类型、精度、NULL 或存量处置；
- 是否保留 provenance、原始 payload、兼容层、双写、alias 或 fallback；
- 空结果、部分成功、retry、dead-letter、自动恢复或 exactly-once 声明；
- 生产 schema、终端行为或消费者与代码推断不一致。

## 6. 实现边界

### 6.1 契约与数据

- provider-native、wire、canonical/domain 与 persistence 分层转换，不混名、不猜 alias。
- 公共字段修改同步 producer、consumer、OpenAPI、fixture、negative tests、deploy 和 monitoring。
- 缺失值不静默补 `0`、空字符串或当前时间；显式数字 `0` 与缺失严格区分。
- 数据库变更只新增 forward-only migration，已应用 migration 不重写。
- app 不直接 import 另一个 app 的内部 source；复用逻辑先进入 approved shared library。

详见[契约与数据治理指南](contract-and-data-governance-guide.md)。

### 6.2 错误与运行时

- 低层代码保留原始错误事实，最终 HTTP/RPC/task/realtime 边界负责分类和权威日志。
- queue、pending map、cache、retry list 和 retained result 都有硬上限、清理与观测。
- 外部 I/O 有 timeout，整轮任务有 deadline；不得用不可取消的 `Promise.race` 冒充取消。
- retry、fallback、recovery 和 reconciliation 必须有唯一 owner、幂等证明、上限和验收。
- 下游失败不得反向修改已经提交的上游事实，除非 owning spec 明确定义原子事务。

详见[错误处理指南](../backend-error-handling-governance-guide.md)和
[运行时与可观测性治理指南](runtime-and-observability-governance-guide.md)。

### 6.3 文件和删除

- TypeScript 使用 kebab-case，Python 使用 snake_case；basename 表达主要职责。
- 删除或移动文件前全仓检索 import、barrel、test discovery、Nest/TypeORM registration 和文档引用。
- 只有本地生成物或“无调用方/已被替代”证据充分的 tracked artifact 才能删除。
- 删除同时修正生成器、ignore 和当前文档，防止文件再次出现。
- 不修改归档 evidence 来制造当前检索为零；检索时显式排除 archive。

## 7. 验证

### 7.1 结果分类

验证报告必须分别写明：

- `通过`：命令实际成功且覆盖声明范围；
- `已修复`：发现并完成修正的项目；
- `跳过`：有意未执行及原因；
- `环境阻塞`：凭据、网络、真实 MySQL、Windows session 或交易时段不足；
- `待 HIL`：自动化不能替代的真实终端、provider、部署或渠道证据。

不得把 mock、非交易时段、workflow 绿色或 route 可达描述成严格生产 HIL。

### 7.2 最低验证组合

按影响范围选择，定向测试不能冒充全量基线：

```bash
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```

其他仓库使用各自 README/CI 声明的完整验证；Mist PowerShell 工作统一使用 `pwsh-preview`。

> 注意：命令必须从当前 `package.json`、workflow 或 runbook 重新核实。文档中的基线不能覆盖仓库
> 实际脚本变化。

### 7.3 契约和残留检索

- `openspec validate --all --strict`；
- `git diff --check`；
- 退役字段、旧 path、兼容 alias 和无作用域状态名的全工作区检索；
- fixture 与 `.sha256` sidecar 一致性；
- migration、entity metadata、raw SQL 和 schema audit 一致性；
- Markdown 相对链接和文档入口可达。

## 8. 提交、发布与归档

### 8.1 提交

- 提交前审阅 staged diff，确保没有吸收其他 worktree 或用户改动。
- commit message 表达交付结果，不把尚未通过的 HIL 写成完成。
- 本地 commit、remote push、CI、部署和生产验收是五个独立状态，必须分别报告。

### 8.2 发布

- 破坏性跨仓契约以匹配版本组发布，不允许新旧 producer/consumer 任意混跑。
- 数据库发布需要 preflight、migration、postflight、readback、备份和 repair-forward。
- terminal bridge 需要记录实际安装路径和 SHA-256；仓库或 datasource 部署不证明终端已更新。
- 回滚必须与 schema 兼容；旧应用不能读取新 schema 时，不得声称只回滚镜像即可。

### 8.3 OpenSpec 归档

只有同时满足以下条件才归档：

- requirements 和 tasks 已完成；
- 自动化、真实环境和 HIL 证据按 owning change 要求齐全；
- stable spec 已同步，Purpose 不残留过期 owner 或路径；
- active change 不再包含未决 gate；
- strict validation 通过。

延期、放弃或被替代的工作必须进入 disposition，不得通过勾选或删除 task 假装完成。

## 9. 文档规则

- 当前用户、开发者和运维文档默认使用简体中文，标识符保持原文。
- living guide 只记录当前规则；dated audit/evidence 保留当时事实，不追溯改写。
- 当前状态只在一个 owner 文档维护，其他文档通过链接引用，不复制 task count 或常量。
- 新规则先进入 owning spec/change，再摘要到 guide；guide 不是绕过 OpenSpec 的审批入口。
- 文档路径变化必须同步 README、OpenSpec、runbook、AI instructions 和相对链接。

## 10. 交付模板

```markdown
## 范围
- repo / branch / SHA / dirty/worktree
- contract、database、deploy、monitoring、HIL 影响

## 结论
- 通过：
- 已修复：
- 待讨论：
- 跳过/环境阻塞/待 HIL：

## 验证
| 命令或证据 | 结果 | 覆盖范围 |

## 发布与回滚
- local commit：
- remote push：
- migration/版本组：
- HIL：
- rollback/repair-forward：
```
