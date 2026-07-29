# Phase A 单时间栈验证证据

## TDD 红灯

- 旧双数组实现的红灯命令为 `npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots"`：退出码 `1`，`1/1` 个 suite 失败、`2/2` 个测试失败。完整沪深300输出 `8` 对 valid Complete-Bi 严格重叠，包含外层 `206 → 302` 与内层 `222 → 228`；完整上证指数的 Phase A 实得 `47`，不满足新基线 `35`。这是在接入单栈前记录的 RED，而非最终实现的测试结果。
- 该 RED 的失败是算法断言本身：fixture 解析与 NestJS module 构造均成功；本 change 未通过改测试、删断言或修改 fixture 掩盖该失败。

## Phase A helper 独立验证

- 新鲜命令：`npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack.helper"`；退出码 `0`，`1/1` 个 suite 通过、`7/7` 个测试通过、`0` 个 snapshot。该 `npx jest` 输出未出现 Node engine warning。
- `7/7` 覆盖了：一次新候选触发连续两次栈顶三笔归约、三笔均为 Valid 时停止、含 Invalid 但不可合并时保留、leading Invalid 保留、候选入栈不连续时报错、合并产物越过外边界时报错，以及输入数组和 `BiVo` 对象不被修改。
- helper 提交：`60628bc201cfedd1cccd333d6f7f8d1d08c9727f`（`feat(chan): add phase A time-stack helper`）。该提交只新增 helper、helper spec 与本 change 的 `tasks.md`，可独立回退。

## 后端联合验证

- 新鲜命令：`npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots|bi-merge-cases"`；退出码 `0`，`2/2` 个 suite、`8/8` 个测试、`0` 个 snapshot。`bi-merge-cases` 为 `6/6`；完整真实快照为 `2/2`，确认 CSI300 不再有 valid Complete-Bi 重叠或 `206 → 302` / `222 → 228` 见证，上证为 Phase A `35`、Phase B `25`。该命令未输出 Node engine warning。
- 新鲜命令：`npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack|bi-phase-b-merge|bi.service.spec|channel.service.spec"`；退出码 `0`，`4/4` 个 suite、`23/23` 个测试、`0` 个 snapshot；该命令未输出 Node engine warning。
- 新鲜命令：`pnpm run typecheck`；退出码 `0`，`tsc --noEmit` 成功（suite/test 不适用）。Node engine warning：项目要求 `>=24.0.0`，实际为 Node `v22.12.0` / pnpm `9.15.3`。
- 新鲜命令：`pnpm run lint:check`；退出码 `0`，ESLint 成功（suite/test 不适用）。同一 Node engine warning。
- 新鲜命令：`pnpm run test:ci`；退出码 `0`，`58/58` 个 suite、`357/357` 个测试、`0` 个 snapshot。测试中 Nest 的 TDX、East Money、QMT、scheduler 与 exception-filter `ERROR` 输出来自已断言的 mock/error-path；同一 Node engine warning。
- 新鲜命令：`openspec validate refactor-chan-phase-a-time-stack --strict`；退出码 `0`，输出 `Change 'refactor-chan-phase-a-time-stack' is valid`（suite/test 不适用，未输出 Node engine warning）。在勾选 6.1/6.2 后已对最终工作树再次复跑，结果仍为退出码 `0`。
- 范围审计命令：后端与前端分别运行 `git status --short` 和 `git diff --stat`。后端仅显示本 change 的 `evidence.md`、`tasks.md`（`2 files changed, 34 insertions(+), 1 deletion(-)`）以及既有未跟踪 `.superpowers/`；前端两个命令均无输出、工作树干净。新鲜 `git diff --check` 退出码 `0`（suite/test 不适用，未输出 Node engine warning）；在勾选 6.2 后会对最终树再次复跑。
- 服务集成提交：`e59124a126c6dae65c8bcae2a4ec1fedaefc1390`（`refactor(chan): integrate phase A time stack`）；只改 `bi.service.ts`、其 spec 与本 change 的任务清单。`60628bc` 的 helper 边界与该服务组合边界可分别回退；`bi-phase-b-merge.helper.ts` 未在二者中修改。
- 范围审计基线：从实施计划提交 `7265305` 到最终证据提交前的后端文件只有两份完整 fixture、真实快照 spec、Phase A helper/spec、`bi.service.ts`/spec 与本 change 的 `tasks.md`；未包含 roadmap、BigQMT、已归档 preview、chart rendering、API 或 Phase B helper 文件。

## 前端与页面验证

- 前端快照提交：`82b6bdd4c4fe390f7cc13615f8be271a249d6706`（`test(chan-tests): refresh phase A time-stack snapshots`）。四组 Phase A / Phase B 数量为：沪深300 `31 / 31`、上证指数 `35 / 25`、创业板指 `27 / 21`、贵州茅台 `34 / 30`。该提交只改四组 `bi.json`/`meta.json` 与上证 fixture 回归测试，能够独立回退。
- 新鲜命令：`pnpm run typecheck`；退出码 `0`，`tsc --noEmit` 成功（suite/test 不适用）。Node engine warning：项目要求 `>=24.0.0`，实际为 Node `v22.12.0` / pnpm `9.15.3`。
- 新鲜命令：`pnpm run lint`；退出码 `0`，ESLint 成功（suite/test 不适用），同一 Node engine warning。
- 新鲜命令：`pnpm run test:ci`；退出码 `0`，`15/15` 个 suite、`82/82` 个测试、`0` 个 snapshot，同一 Node engine warning。
- `/chan-tests` 页面重新检查：四个用例按钮均可切换 Phase A / Phase B，DOM 的 pressed state 与统计显示分别为 CSI300 `31 / 31`、上证 `35 / 25`、创业板 `27 / 21`、茅台 `34 / 30`。该结论证明页面状态和计数切换，不把画布截图当作“笔线不存在”的视觉证明。
- 画布限制必须保留：Task 5 的自动化 ECharts canvas 截图记录为未显绘制画布内部内容；控制台也复现既有 warning：`笔 series not exists. Legend data should be same with series name or data name.`。因此没有声称靠肉眼确认不存在任何线条；Phase A 无重叠的结论来自后端断言与前端快照结构校验，而非 canvas 目视。
- 延期的 Phase B 长笔不在本 change 改动范围：CSI300 保留 `279 → 350`（`2025-06-22 → 2025-10-29`，up，`71` 个 merged-K 索引）；上证继续保留已锁定关键段 `142 → 195`（down、valid）和 `266 → 317`（up、valid）。这些连续但跨度长的笔留给后续独立 change 评估。

## Phase C：最终内联收口（2026-07-11）

### 提交与迁移边界

- `fff69ff docs(openspec): plan chan bi service consolidation`：重开未归档 change，将独立 helper
  明确为历史验证步骤，最终生产结构改为 `BiService` 私有方法；前端约束为只验证、零快照变化。
- `62b7e82 refactor(chan): inline phase A time-stack reduction`：把 Phase A 的 7 个 helper 场景
  迁移到 NestJS Test module 的 `bi.service.phase-a.spec.ts`，内联
  `reducePhaseATimeStack(candidates, data)`，删除 `bi-phase-a-time-stack.helper.ts`。
- `54940ba refactor(chan): inline phase B segment merge`：把 Phase B 的 9 个 helper 场景迁移到
  NestJS Test module 的 `bi.service.phase-b.spec.ts`，内联
  `isPhaseBMergeableSpan` 与 `mergeBiSegments(phaseABis, data)`，删除
  `bi-phase-b-merge.helper.ts`。
- 两次迁移都先在改名后的 service-phase 测试中确认 RED：Phase A 缺少
  `reducePhaseATimeStack` 时出现 TypeScript `TS7053`；Phase B 缺少 `mergeBiSegments` 时 `9/9`
  测试报预期 `TypeError`。随后才加入生产方法。

### Phase C 后端验证

- `npx jest --runInBand --watchman=false --testPathPattern="bi.service.phase-a|bi.service.phase-b"`：
  退出码 `0`，`2/2` suites、`16/16` tests、`0` snapshots。覆盖原 Phase A `7` 个和 Phase B `9`
  个场景，均改为 NestJS Test module 与 private-method spies。
- `npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-real-snapshots|bi-merge-cases|bi.service.spec|channel.service.spec"`：
  退出码 `0`，`4/4` suites、`15/15` tests、`0` snapshots。完整 CSI300、完整上证、上证裁剪
  `6/6` 场景、服务结构断言与 Channel 契约均保持通过。
- `pnpm run typecheck`：退出码 `0`；`pnpm run lint:check`：退出码 `0`；两者仅出现项目声明
  Node `>=24`、本机 Node `v22.12.0` 的既有 engine warning。
- `pnpm run test:ci`：退出码 `0`，`58/58` suites、`357/357` tests、`0` snapshots。测试中
  TDX/East Money/QMT 等 `ERROR` 日志来自既有 mock 的 error-path 断言，不是测试失败。

### Phase C 结构与前端零变化检查

- `openspec validate refactor-chan-phase-a-time-stack --strict`：退出码 `0`，输出
  `Change 'refactor-chan-phase-a-time-stack' is valid`；`git diff --check 5f174e6..HEAD`：退出码 `0`。
- 已确认两个 helper 源文件均不存在；排除测试中的负向架构断言后，生产 services 目录不再包含
  `PhaseATimeStackOperations`、`PhaseBMergeOperations` 或任一 helper import/path。`BiService`
  结构测试同时断言两个阶段私有方法存在、旧 `confirmed`/`pending` 状态机不存在。
- `mist-fe` 分支仍为 `feat/chan-tests-phase-b-preview`、基线提交 `82b6bdd`；`git status --short`
  无输出、`git diff --quiet` 成功，未生成或修改任何快照。
- 前端 `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:ci` 均退出码 `0`；完整测试为
  `15/15` suites、`82/82` tests、`0` snapshots。
