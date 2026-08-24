# Tasks: track-remaining-work

> 状态约定：本 change 只做状态追踪和盘点，不修改任何 owning change 的 tasks.md。
> 当某个 owning change 完成其 tasks 后，本 change 对应条目标记为 `已解决` 并附证据。

## 1. 汇总 active change 剩余项

- [x] 1.1 盘点 `integrate-production-realtime-subscription-lifecycle`（43/43，已于 2026-08-24 归档）
- [x] 1.2 盘点 `add-realtime-subscription-operator-ux`（20/20，已于 2026-08-24 归档）
- [x] 1.3 盘点 `extract-backtest-runtime`（27/27，全部完成，已归档）
- [x] 1.4 盘点 `capture-realtime-provider-anomalies`（0/14，剩 14 项）

  | 阶段 | 状态 | 阻塞 |
  |------|------|------|
  | §1 证据合约（3 项） | `coding` | 无阻塞 |
  | §2 只读采集器（4 项） | `coding` | 无阻塞 |
  | §3 运维 workflow（4 项） | `coding` | 无阻塞 |
  | §4 发布与 review（3 项） | `env-blocked` | 依赖首个真实 incident |

- [x] 1.5 盘点 `add-chan-bsp-realtime-evaluation`（已于 2026-08-24 归档）
- [x] 1.6 盘点 `add-chan-bsp-backtest-evaluation`（22/22，全部完成；归档前置为部署项）

  | 阶段 | 状态 | 证据 |
  |------|------|------|
  | §1 前置与基线（3 项） | ✅ **已解决** | commit `fa523648`（imputer 0 异常化）+ 全量基线 186 suites/1555 tests |
  | §2 实体与 migration（4 项） | ✅ **已解决** | commit `f243bfd2`/`072b085e`；021 生产执行已完成（2026-08-22） |
  | §3 回测编译分派（4 项） | ✅ **已解决** | commit `aff953ed` |
  | §4 回测求值分派 + 回放（4 项） | ✅ **已解决** | commit `aff953ed`（完整信号流/矫正层第一原则）+ `681855e6`（共享 serializer） |
  | §5 单测（3 项） | ✅ **已解决** | executor 11/11 + create 8/8 + imputer 9 新用例；5.3 本地隔离 mysql:8.4 readback |
  | §6 可观测性（2 项） | ✅ **已解决** | `backtest chan_bsp plan compiled` info 日志（L204） |
  | §7 验证与收尾（2 项） | `deploy-blocked` | 代码/单测/基线已推送（`f22c2c30`）；归档前置 = 生产部署验证 |

- [x] 1.7 盘点 `remove-quantity-profile-gates`（12/12，已于 2026-08-24 归档）
- [x] 1.8 盘点 `audit-chancore-algorithms`（8/8，已于 2026-08-24 归档）
- [x] 1.9 盘点 `fix-chan-central-expansion-condition`（7/7，已于 2026-08-24 归档）

## 2. 汇总代码质量遗留

- [x] 2.1 P1 级未修复项（4 条，来自 `REMEDIATION_AUDIT_REPORT.md`）

  | ID | 仓库 | 描述 | 2026-08-22 核实状态 |
  |----|------|------|---------------------|
  | I4 | mist-deploy | 9 个 test-*.ps1 自测脚本零 CI 接入 | ✅ **已解决**：`test-deploy-scripts.yml` 已有 push/PR 触发器，覆盖 20 个测试脚本 |
  | I6 | mist-deploy | 部署 workflow 无 environment 门禁 | ✅ **已解决**：`deploy-windows-mist-stack.yml` 已有 `environment: mist-production` |
  | H4 | mist-datasource | `create_sector` 三处签名不一致 | ✅ **已解决**：`create_sector` 在当前代码中不存在（审计过时） |
  | N6.1 | mist-deploy | `Invoke-DockerApplianceRollback` 形参 `$Paths` 被忽略（隐藏 live bug） | ✅ **已解决**：审计过时——`$Paths` 在函数体内被正确使用（`$Paths.EnvPath`、`Invoke-DockerCompose -Paths $Paths`），PowerShell 大小写不敏感 |

- [x] 2.2 P2 级未修复项（3 条关键项）

  | ID | 仓库 | 描述 | 2026-08-22 核实状态 |
  |----|------|------|---------------------|
  | P1.4 | mist | `K_UPSERT_COLUMNS` 仍在 tdx/east-money 各定义一份 | ✅ **已解决**：只在 `k-save.helper.ts` 定义一次，三个 provider 均 import |
  | H5 | mist-datasource | 旧路由 + `/v1` 路由同时挂在 `tdx/main.py:198-205` | ✅ **已解决**：`tdx/main.py` 已不存在 |
  | D2.3 | mist-datasource | `tdx/services/` + `qmt/services/` 整层死代码仍在 | ✅ **已修复**（本轮）：删除 `adapter_legacy/`、`tdx/services/`、`qmt/services/` 残留 `__pycache__`；hygiene 测试 19/19 通过 |

## 3. 汇总前端迁移待办

- [x] 3.1 Phase 3 待做（mist-fe design system 推广到现有页）

  | 页面 | 改动 | 工作量 |
  |------|------|--------|
  | `/k` | next/dynamic 懒加载 KPanel + antd toolbar + RangeSwitcher + 删冗余 ErrorBoundary | 中 |
  | `/strategies` | 原生 `<table>` → antd Table（排序/筛选/分页）+ 告警状态语义色徽章 + 662 行拆分子组件 | 大 |
  | `/chan-tests` | 去 inline hex 改 Token + StatsPanel 时间格式改固定 Intl.DateTimeFormat | 小 |

- [x] 3.2 Phase 5 待做（收尾与文档）

  | 项 | 内容 |
  |----|------|
  | 文档 | `docs/design-system.md`（色板表、Token 对照、深浅规则、图表交互规范） |
  | ESLint | 禁止 `app/components` / `app/**/page.tsx` 内裸 hex 颜色字面量 |
  | 清理 | 删空目录 `app/api/types/`、`app/components/test-statistics-panel/` |

## 4. 汇总环境阻塞项

- [x] 4.1 需要 Windows + TDX/QMT + 交易时段的验证项（4 项）

  | 来源 | Task | 描述 |
  |------|------|------|
  | lifecycle | 6.8 | 全面 reconciliation（依赖项目负责人审核） |
  | realtime-eval | 7.2 | shadow 实盘验证 |
  | realtime-eval | 7.3 | 切 on 决策（依赖 7.2） |
  | anomalies | §4 | 首个真实 incident 后 review |

- [x] 4.2 `2026-08-21-realtime-subscription-restart-recovery` HIL 未完成项（4 项，已归档 change）

  | Task | 描述 |
  |------|------|
  | 7.1 | TDX 终端重启 HIL（callback 恢复 + ingest 恢复 + PUSHING→VERIFIED） |
  | 7.2 | QMT 终端重启验证（callbackObserved 恢复 + VERIFIED 零 SDK 调用） |
  | 7.3 | 双源 stall 告警验证（窗口内断流→PUSHING→escalated→A7 触发） |
  | 7.4 | 阈值校准（STALL_GRACE / MAX_RECOVERY_CYCLES 实盘校准） |

## 5. 标记废弃项

- [x] 5.1 `feat/strategy-portfolio-backtesting` 分支标记为废弃

  - 状态：**废弃**
  - 原因：基于 2026-07-18 旧 merge-base（`5c083f76`），与 master 差 1287 文件 / 127k 行删除，实质不可恢复
  - 如需重启 portfolio backtest，需从头实施，以归档 proposal 的 Restart Prerequisite 为背景
  - 已更新：`strategy-portfolio-backtesting-deferred.md`（加核实注释）、`mist MEMORY.md`（加过时标记）

## 6. 收尾

- [x] 6.1 交叉引用验证：所有盘点数据基于 2026-08-22 各 change tasks.md 的实际勾选状态
- [x] 6.2 记忆文件更新：
  - `strategy-portfolio-backtesting-deferred.md`：标记分支不可恢复
  - `mist MEMORY.md`：portfolio 条目加过时标记
  - `mist-fe MEMORY.md`：新增 design system 条目
  - `institutional-quant-workbench-design-system.md`：新建，记录 Phase 0-5 状态
  - `REMEDIATION_AUDIT_REPORT.md`：mist-fe 段落加 2026-08-22 补充注脚
