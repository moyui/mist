# Frontend Breaking Release Gate（2026-08-04）

## 结论

任务 3.5 的独立前端交付已完成，可以与删除后端 `POST /v1/strategy-scans/run` 的 breaking change
组成匹配发布集合。本 change 不修改 `mist-fe` 代码。

## 固定版本

- repository：`mist-fe`
- worktree：`/Users/moyui/sean/mist/.worktrees/evolve-strategy-evaluation-contract-fe/mist-fe`
- branch：`feat/evolve-strategy-evaluation-contract-fe`
- HEAD：`1b4290130bc727fce08835107f664072baa5e274`
- remote：同一 commit 已是 `origin/master` 与 `origin/feat/evolve-strategy-evaluation-contract-fe`
- dirty：clean

`mist-fe` 主目录当前位于独立的 `feat/design-system-phase0`，仍包含旧 consumer；它不是本 release gate
的交付版本，不能与已删除后端接口混合发布。

## 负向契约

前端交付已经：

- 从 `app/api/client.ts` 删除 `runStrategyScan` 与 `/v1/strategy-scans/run`；
- 从 `StrategiesWorkspace.tsx` 删除人工实时扫描动作；
- 更新页面交互测试，不再期望 manual scan；
- 在 `app/api/__tests__/client.test.ts` 固定负向门禁，断言 client source 不包含
  `runStrategyScan` 或 `/v1/strategy-scans/run`。

因此发布时必须使用 `mist-fe@1b429013` 或包含该 commit 的后继版本；不得部署当前旧主目录 branch
或任何仍调用 manual live-scan 的前端版本。
