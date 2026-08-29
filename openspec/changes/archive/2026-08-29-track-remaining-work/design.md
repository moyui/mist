# Design: track-remaining-work

## 设计原则

本 change 是纯 tracking 性质，不涉及代码实现。设计目标是建立一份**可执行的状态清单**，让项目负责人一眼看清所有待办项的优先级、阻塞条件和归属。

## 追踪维度

### 维度 1：Active OpenSpec Changes（交叉引用）

不修改各 change 的 tasks.md，只在这里汇总未完成项的数量和阻塞状态。引用格式：`→ change-name/tasks.md §X.Y`。

### 维度 2：代码质量遗留（来自 REMEDIATION_AUDIT_REPORT.md）

只追踪 P1/P2 级未修复项（P3 按计划暂缓）。每条记录：ID、仓库、描述、优先级、建议修法。

### 维度 3：前端迁移（mist-fe design system）

Phase 0-2 已完成（独立验证），Phase 3/5 待做。记录具体文件和改动范围。

### 维度 4：环境阻塞项

需要特定环境才能验证的项，统一标注阻塞条件。当环境就绪时可批量推进。

## 状态分类

| 状态 | 含义 |
|------|------|
| `coding` | 需要写代码，无环境阻塞 |
| `env-blocked` | 需要 Windows + TDX/QMT 终端 + 交易时段 |
| `deploy-blocked` | 需要部署到生产后才能验证 |
| `decision-blocked` | 需要项目负责人决策 |
| `deferred` | 明确延期，不在当前迭代 |
| `废弃` | 不再推进 |

## 优先级

| 级别 | 含义 |
|------|------|
| P0 | 阻塞生产或核心链路 |
| P1 | 影响部署流程或运维安全 |
| P2 | 影响代码质量或可维护性 |
| P3 | 低优先级改善项 |

## 交叉引用规则

- 本 change 的 tasks 只做**状态记录**，不修改任何 owning change 的 tasks.md
- 当某个 owning change 完成其 tasks 后，本 change 对应条目标记为 `已解决` 并附证据
- 归档前置：所有条目标记为 `已解决` 或 `废弃` 后，本 change 才可归档
