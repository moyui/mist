# Mist OpenSpec 与文档治理指南

状态：Living guide
适用范围：`mist/openspec`、跨仓 roadmap、living docs、runbook、audit 和 evidence

## 1. 目的

本指南规定 Mist 如何维护产品真相、active change、长期 guide 和历史证据，避免同一决策在 README、
roadmap、OpenSpec 和聊天记录中形成多个冲突版本。

## 2. 信息类型与权威性

| 类型 | 目录/示例 | 作用 | 是否作为当前真相 |
|---|---|---|---|
| stable spec | `openspec/specs/<capability>/spec.md` | 当前已接受产品/运行契约 | 是 |
| active change | `openspec/changes/<change>/` | 待实施或正在实施的增量决策 | 已确认部分是 |
| living guide | `docs/governance/` 与关联 guide | 跨 change 的长期开发规则摘要 | 低于 spec/migration |
| living runbook | `docs/production-*.md` 等 | 当前操作和验收步骤 | 需与代码/部署复核 |
| dated audit/evidence | 日期命名文档、`evidence/` | 当时的事实、命令和结果 | 否，引用前复验 |
| archived change | `openspec/changes/archive/` | 历史决策和证据 | 否，不反向恢复 |
| chat/旧设计稿 | 外部记录、`docs/superpowers/` | 讨论与历史背景 | 否 |

## 3. 何时创建或更新 change

修改以下任一项时，先创建或更新 OpenSpec：

- 公共 HTTP/RPC/WS/OpenAPI、跨仓 payload、环境变量和 metrics；
- database schema、migration、数据 owner、precision/nullability；
- provider 语义、权威数据源、持久化、recovery、compatibility；
- app/worker/queue、leader/generation、retry/dead-letter、自动恢复；
- deploy topology、terminal bridge、release order 或 multi-repo cutover；
- 已存在路径的删除、职责 owner 改变或产品范围扩张。

纯内部且不改变外部契约的重构、测试、注释和非语义文档修复通常不需要新 change。

## 4. Change 工件职责

| 工件 | 写什么 | 不写什么 |
|---|---|---|
| `proposal.md` | Why、scope、capability、impact、明确 non-goals | 逐行实现或未确认细节 |
| `design.md` | owner、data flow、决策、备选、风险、migration、open questions | 把猜测写成已接受事实 |
| `specs/**/spec.md` | ADDED/MODIFIED/REMOVED requirements 与可验收 scenario | 仅有任务描述、无行为标准 |
| `tasks.md` | 依赖顺序、评审 gate、实现、验证、HIL、archive | 用 checkbox 替代 evidence |
| `evidence/` | immutable inputs、命令、结果、artifact identity、阻塞项 | secret、未脱敏 raw dump、推断成事实 |

未确认的 provider/schema/retry/compatibility/deployment/HIL 决策必须在 design/tasks 中明确标成 gate，
不能让实现自行决定。

## 5. Change 生命周期

```text
现状审计
  → proposal/design/spec/tasks
  → strict validation
  → 分阶段实现与 evidence
  → requirements/tasks 对账
  → stable spec sync
  → archive
```

### 5.1 开始

- 从当前目标 branch/HEAD 读取 stable specs、active changes、migration 和真实代码。
- `openspec list --json` 之外还要检查 `openspec/changes/` 与 Git status，避免漏掉 untracked change。
- 一个 child change 保持独立 scope、owner、verification 和 archive disposition。

### 5.2 实施

- task 只有在代码和所需验证真实完成后勾选。
- 设计确认 task 与产品实现 task 分开，不用前者的勾选比例宣称代码完成。
- 发现 scope/owner/contract 变化时，先更新 proposal/design/spec，再继续实现。
- external/HIL gate 无法完成时保留 pending，不用 mock 或 unit test 替代。

### 5.3 同步与归档

- ADDED/MODIFIED/REMOVED delta 必须与 stable spec 精确匹配。
- 删除旧 owner 或路径时显式使用 REMOVED/MODIFIED，不能只新增一条冲突 requirement 覆盖旧文。
- 归档同步后复核 stable Purpose，不得残留已退役 owner、路径或当前状态。
- `openspec validate --all --strict`、文档链接和旧词检索通过后再归档。
- 未完成但延期、放弃或被替代的工作进入 disposition ledger，不假装 complete。

## 6. Roadmap 治理

一个领域保留一个可执行 living roadmap：

- 使用 dependency gate 组织顺序，而不是扁平 unchecked list 或 commit 清单；
- 每个 gate/child 写明 owner、前置、verification、external dependency 和 exit disposition；
- `completed`、`superseded`、`deferred`、`dropped` 与真实 backlog 分开；
- child change 保持独立实施和归档，roadmap 不复制其所有 tasks/常量；
- remembered branch、stash 或历史 worktree 只能逐文件参考，不能继承旧 task state。

## 7. 从 spec 提炼长期 guide

一条 spec 规则只有同时满足以下条件才适合进入 guide：

1. 跨两个以上 feature/change 或会反复用于审查；
2. 不依赖一次性 migration number、provider version、环境常量或临时状态；
3. owner 和语义已经 stable，或 active change 的相关决策已逐项确认；
4. 可以作为开发检查规则，而不是产品验收 requirement 的替代副本；
5. 写入 guide 后仍能明确链接回 owning spec。

以下内容通常不升格：

- Chan 算法阶段、具体策略规则、portfolio 范围等产品语义；
- 某个 provider 的 method、native field matrix 或 terminal version；
- queue name、timeout 数值、Redis key、migration 编号等 change-local 常量；
- dated HIL 结果、task 完成比例和当前 worktree 状态；
- 历史 remediation item 的一次性处理细节。

提炼采用“摘要 + 来源 + 检查清单”，不得把完整 spec 复制进 guide。当前映射见
[OpenSpec 规范提炼映射](spec-derived-governance-map.md)。

## 8. 文档维护

### 8.1 语言与标识符

新建或实质重写的 Mist 用户、开发者和运维文档默认使用简体中文。命令、API path、env var、protocol
field、class、provider 和外部产品名保持原文。归档 evidence 和历史设计不追溯翻译。

### 8.2 Living 与历史分离

- living guide 只保留当前规则，不累计日期化执行记录。
- runbook 只保留当前可执行命令；旧命令进入 dated evidence/archive。
- dated audit 保留当时 branch/SHA/结论，不持续改写为当前状态。
- 当前 task/status 只在 owning active change/roadmap 维护，README 用链接指向。

### 8.3 链接和路径

- 相对链接从文档所在目录解析并验证。
- 文件移动同步 README、related guides、OpenSpec、runbook 和 AI instructions。
- 不为了让 active 文档“看起来干净”而修改 archived path/evidence。
- 路径迁移不应同时偷偷改变 runtime contract 或产品 scope。

## 9. 维护检查清单

- [ ] 当前结论来自 stable/accepted active spec，而不是 archive/chat。
- [ ] proposal/design/spec/tasks/evidence 各自职责清晰。
- [ ] deferred/superseded/dropped 与 executable backlog 分开。
- [ ] active task 勾选有代码或 evidence 支撑。
- [ ] stable sync 删除了旧 requirement，并更新了 Purpose。
- [ ] guide 只摘要跨 change 规则，没有复制 feature 常量。
- [ ] living docs 与 dated evidence 未混写。
- [ ] 中文文档保留 identifiers 原文。
- [ ] 相对链接、旧路径检索和 `openspec validate --all --strict` 通过。
