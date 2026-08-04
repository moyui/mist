# Strategy Evaluation Contract 跨仓最终验证（2026-08-04）

## 结论

- `mist` 后端交付固定在 `511a0c4`，`mist-fe` 匹配交付固定在 `1b42901`。
- creation-only、必填 `signalKind`、decimal-string 保真、live Signal `securityId + signalKind` 已在前后端
  对齐。
- 前端已删除 legacy manual live scan client、UI action、mock 和正向测试，并增加旧 route 不得恢复的
  negative guard；只有后续 realtime owning change 可以产生 live Signal。
- tasks 3.5、4.1、4.3 的交付与证据已完成。task 4.4 仍需项目负责人审核后才能归档。

## Producer 到 Consumer 影响链

```text
StrategyVersion.signalKind / StrategySignal.securityId+signalKind
  -> apps/mist HTTP entity response and query DTO
  -> HTTP envelope
  -> mist-fe StrategyVersion / StrategySignal / StrategySignalQuery
  -> creation form, read-only registry and live Signal table
```

退役链路为：

```text
POST /v1/strategy-scans/run
  -> backend controller/service/DTO removed
  -> frontend client/types removed
  -> both scan buttons and mocks removed
  -> static negative guard prevents route reintroduction
```

`BacktestSignalResult.securityCode` 继续属于 run-owned backtest result schema，不是 live Signal 兼容字段，
因此仍保留在前端 backtest result 类型和表格中。

## 修复提交

| 仓库 | 分支 | 提交 | 内容 |
| --- | --- | --- | --- |
| `mist` | `feat/evolve-strategy-evaluation-contract` | `511a0c4` | 后端 contract、migration 与验证证据基线 |
| `mist-fe` | `feat/evolve-strategy-evaluation-contract-fe` | `023b1ba` | creation-only、必填 signal kind、decimal string |
| `mist-fe` | `feat/evolve-strategy-evaluation-contract-fe` | `1b42901` | 删除 manual scan，live Signal 改为 `securityId + signalKind` |

## 自动化验证

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| FE targeted Jest | 通过 | strategy page 与 API client：2 suites / 58 tests |
| FE full Jest | 通过 | 15 suites / 127 tests |
| FE ESLint | 通过 | 全仓无 error |
| FE TypeScript | 通过 | `tsc --noEmit` |
| FE production build | 通过 | Next.js 16.1.4，`/strategies` 等路由构建成功 |
| Backend full Jest | 通过 | 沙箱内 103 suites / 953 tests 通过；2 个 socket suites 受环境限制 |
| Backend socket rerun | 通过 | 宿主允许临时监听后 2 suites / 10 tests 通过 |
| Backend lint/typecheck | 通过 | full ESLint 与 `tsc --noEmit` |
| Backend builds | 通过 | `mist`、`chan`、`schedule`、`realtime-subscription-hil` |
| Cross-repo CI contracts | 通过 | 使用本 change backend worktree 与 `1b42901` FE worktree 组合验证 |
| Migration 014 MySQL 8.4 | 通过 | GitHub Actions run `30838073557`；全顺序、repair-forward、拒绝非零存量、FK readback |
| Production schema audit | 通过 | `mist-deploy` run `30833811747`；只读确认 migrations 001–013 与六表零存量 |
| OpenSpec strict | 通过 | `openspec validate --all --strict` |
| Diff check | 通过 | working diff 与 branch-range diff；raw production TSV 通过精确 `.gitattributes` 例外保留尾部空字段 |

## 禁止项与身份检索

- FE production code 不再包含 `runStrategyScan`、`StrategyScanRequest`、`StrategyScanResult` 或
  `/v1/strategy-scans/run`。
- live `StrategySignal` query/response/UI 使用 `securityId` 与 `signalKind`；仅 backtest result 继续使用
  已批准的 `securityCode`。
- FE 不包含 strategy PATCH/update consumer、`lookbackBars`、`entryRule` 或 `exitRule`。
- decimal threshold 继续从 JSON editor 以 string 原样进入 create payload，不经过 number coercion。

## 环境、HIL 与 Protected Digest 处置

| 门禁 | 状态 | 处置 |
| --- | --- | --- |
| TDX/QMT quantity source profile 交易时段 HIL | 待验证 | `k.volume/k.amount` definition 可以创建和回测，但 enable/realtime registration 继续 fail-closed |
| Production migration 014 | 未执行 | 必须与匹配 backend + FE 版本、备份、preflight/postflight/readback 一起发布 |
| Realtime protected-table pre/post digest | 未执行/本 change 不适用 | 本 change 没有运行 realtime terminal HIL 或生产 mutation；后续 quantity HIL 和 realtime runtime 验收必须按 stable production baseline 捕获 pre/post digest，不得复用本次 schema inventory 冒充 invariance |
| Supertest local socket | 已解除 | 沙箱阻塞已由宿主 10/10 复跑证明，不再是代码阻塞 |

task 4.3 的完成只表示上述状态、阻塞与后续门禁已经被准确记录；它不表示 quantity HIL 已通过，也不
授权 realtime quantity strategy。非量额规则可以复用本 change 的共享 evaluator；量额规则必须继续由
registration gate 拒绝，直到 owning runtime change 提供真实交易时段 evidence 与 protected digest。

## 发布边界

Migration 014、`mist@511a0c4`（或其后续包含提交）和包含 `mist-fe@1b42901` 的前端版本是匹配发布集合。
不得单独执行 migration 014 后继续运行旧 backend/FE，也不得只部署新 backend 而保留可调用旧 PATCH 或
manual scan 的前端。
