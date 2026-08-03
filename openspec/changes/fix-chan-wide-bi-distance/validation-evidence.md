## 验证证据

记录时间：2026-08-03

### 行为回归

- 红灯：新增测试在旧实现下 5/5 失败，分别复现相邻大 ID 间隔、少于 3 根仍通过、identity spacing
  改变状态、缺失 endpoint 未报错、重复 endpoint 未报错。
- 绿灯：`pnpm test -- apps/mist/src/chan/services/bi.service.spec.ts --runInBand --watchman=false`
  通过，1 suite / 10 tests。
- Chan 全量：`pnpm test -- apps/mist/src/chan --runInBand --watchman=false` 通过，6 suites / 46 tests。
- 全量 Jest：`pnpm test -- --runInBand --watchman=false --silent` 在允许 localhost listen 的执行环境中
  全部通过。

首次在受限 sandbox 运行全量 Jest 时，两个 Supertest integration suites 因 `listen EPERM: operation not
permitted 0.0.0.0` 失败；在允许临时 localhost 监听后原命令通过。该阻塞属于执行环境，不是代码失败。

### 静态与构建门禁

- `pnpm lint:check`：通过。
- `pnpm typecheck`：通过。
- `pnpm build:docker`：`mist`、`chan`、`realtime-subscription-hil` 三个 app 均构建通过。
- `MIST_WORKSPACE_ROOT=<临时完整多仓链接目录> pnpm ci:contracts`：通过；临时目录已清理。
- 受影响文件 ESLint 与 Prettier check：通过。

### OpenSpec 与范围门禁

- `openspec validate fix-chan-wide-bi-distance --strict --no-interactive`：通过。
- `openspec validate --all --strict --no-interactive --json`：65/65 通过。
- `git diff --check`：通过。
- 代码改动仅包含 `bi.service.ts` 和对应 spec；未新增 service request state、DTO/VO、schema、
  ordinal/reference 或其他 Chan 算法变更。

### 后续依赖

`extract-chan-core` 必须在本 change 合并后，以修复后的宽笔结果重新建立 characterization fixture 与
full-output fingerprint；不得继续以数据库 ID 差值行为作为 differential baseline。
