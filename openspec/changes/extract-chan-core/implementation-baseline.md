## 实施基线

记录时间：2026-08-03

### 最终范围

本 change 取代尚未实施的 `extract-market-analysis-kernels`，交付 pure `libs/chancore`，并按后续批准
统一现有 K/Chan HTTP 价格字段：

- 不把 Chan 与 Indicator/Strategy calculation 合并成通用 analysis base；
- 不重构 K reader、module、route ownership、gateway、deploy 或跨 app import；
- `/v1/indicators/k` 与四个 `/v1/chan/*` response 统一使用 `high/low`，不保留 `highest/lowest` alias；
- frontend/skills 已在独立消费者分支完成同步迁移；backend、frontend、skills 三个匹配 commit 必须作为
  同一发布组交付，不允许只部署其中一个；
- 现有调用接入新 core，只保留 fresh-object/Date 映射的薄 HTTP wrapper；
- 为 Backtest、Realtime、Signal/Alert 等后续 owning change 提供直接 library 调用边界，但当前 V1 不
  开放 `chan.*`，不新增 prerequisite。

### 仓库与工作区

- 仓库：`mist`
- 分支：`feat/extract-chan-core`
- worktree：`mist/.worktrees/extract-chan-core`
- 初始审计基线：`master@fe56c6863cc498acbad0a6803da16c2615bb6997`
- 当前实施基线：`master@3a07d4b725dec2c288058505c82959224281d2a3`
- 已同步前置：归档 change `2026-08-03-fix-chan-wide-bi-distance`
- 当前状态：pure source move、Chan wrapper、backend HTTP 与匹配 frontend/skills consumer 的
  `high/low` 字段迁移已完成；未新增 migration

匹配消费者工作区：

- `mist-fe`：`feat/standardize-chan-price-fields`，worktree
  `.worktrees/standardize-chan-price-fields/mist-fe`，commit `4686f9a`；
- `mist-skills`：`feat/standardize-chan-price-fields`，worktree
  `.worktrees/standardize-chan-price-fields/mist-skills`，commit `3dcd8d1`。

### pure calculation 影响链

```text
caller-owned ordered ChanK[]
  -> @app/chancore public facade
  -> private validation
  -> Trend / K merge / Fenxing / Bi / Channel pure calculation
  -> readonly algorithm-owned result
  -> direct consumer or consumer-owned thin wrapper
```

core 不拥有 producer transport、K retrieval、HTTP/RPC wire、database/Redis persistence、deployment 或
monitoring。上述边界由未来采用 ChanCore 的 Backtest/Realtime/Signal/Alert owning change 自己定义。

### 已确认 contract

- library：`libs/chancore`；project `chancore`；import `@app/chancore`。
- facade：`mergeK/findFenxings/createBi/createChannels`；不增加 `analyze()`。
- public barrel：facade、签名所需 types/enums、`ChanInputError/ChanInvariantError`、
  `algorithmVersion=1`；不导出 internals 或 Nest module。
- input：完整 readonly `ChanK(id/symbol/time/open/high/low/close/volume/amount)`；量额为 exact decimal
  string/null。
- outputs：完整 MergedK、Fenxing、Bi/Phase A/Phase B、Channel/Phase A/Phase B；core 与 HTTP VO 均使用
  标准 `high/low`，wrapper 不恢复 `highest/lowest`。
- empty：四个 facade 对空 K 返回自然零结果；不足数据返回自然空集合或未完成笔。
- validation：单 symbol、time 严格递增、identity 唯一、finite OHLC、`high >= low`、合法
  DECIMAL(36,8) string/null；不排序、转换、过滤、去重或填充。
- errors：precondition 使用 `ChanInputError`，算法不变量使用 `ChanInvariantError`；二者不含 HTTP、Nest
  或 persistence 语义。
- numeric：保留现有 strict/non-strict JavaScript number comparison、midpoint 公式和 first-wins；不加
  epsilon/rounding/Decimal；`zg === zd` 不成立中枢。
- mutation：readonly value contract；不 mutation caller，不保留状态/cache，不 runtime freeze/deep-clone；
  允许共享 readonly `ChanK`，引用 identity 不属于公共契约。
- version：正整数 1；算法语义变化必须 version bump + full-output fingerprint，纯 source move/refactor
  不 bump；不进入 HTTP/DB/config。
- 算法基线：宽笔按候选 `originData` 序列位置计数，端点缺失/重复为 invariant failure，不使用数据库
  ID 差。

### 已完成审计

- 当前算法 service/helper/type/test inventory；
- 完整 input/output、empty/error/numeric/mutation/version 逐项评审；
- active Strategy/Backtest/Realtime specs 对照：当前 V1 明确不开放 `chan.*`；
- 完整 45 根 raw K characterization：38 merged K、15 Fenxing、Bi Phase A/Phase B 各 9、Channel
  Phase A/Phase B 各 1；fixture 使用唯一、非连续且局部非单调 ID，并逐笔证明有效宽笔端点唯一且按
  position distance 判断；
- `algorithmVersion=1 + input + complete outputs` SHA-256 fingerprint：
  `7a24563a1d419c87cc151cfcd83ce42732fe59b6fc535de2d818699994964312`；
- strict OpenSpec validation 持续通过。

### Source move 完成证据

- Trend、K merge、Fenxing、Bi、Channel、`bi-range`、`span-merge` 及算法 enums/types 已移动到
  `libs/chancore`；生产源码扫描只发现这一份算法实现。
- public barrel 只暴露 `ChanCore`、四个 facade、批准的 types/enums/errors；没有 deep-import alias、Nest
  module、internal helper 或 `analyze()`。
- 45 根 frozen fixture 在 core 上仍得到 38 merged K、15 Fenxing、Bi 9/9、Channel 1/1，完整 SHA-256
  保持 `7a24563a1d419c87cc151cfcd83ce42732fe59b6fc535de2d818699994964312`。
- equal-center、strict Fenxing、first-wins、Bi non-strict progression、`zg === zd`、相邻 representable
  number、exact Date/identity、frozen input 和四 facade before/after fingerprint 均有定向测试。
- `ChanService` 是 caller-owned 薄边界：core 与 HTTP 均使用 `high/low`，wrapper 复制 Date/数组、保留
  完整 OHLCVA 输入，并保留旧 channel 空数据 HTTP 400；core 自身仍按契约返回合法空结果。
- `@app/chancore` 的生产 import 只存在于现有 Chan wrapper/legacy enum 出口；Backtest、Realtime、
  Signal/Alert、Strategy evaluator 未增加 ChanCore prerequisite。

### HTTP 字段迁移证据

- `KVo`、`MergedKVo`、`FenxingVo`、`BiVo` 与 application Chan contracts 已统一为 `high/low`。
- `/v1/indicators/k` 与 `/v1/chan/merge-k|fenxing|bi|channel` 的实际 mapper 不再生成
  `highest/lowest`；嵌套 `mergedData/originData/startFenxing/endFenxing/bis` 复用相同 VO 映射。
- merge-K OpenAPI 已从错误的 request `MergeKDto` 改为 `MergedKVo[]`；Fenxing OpenAPI 补为
  `FenxingVo[]`；contract test 同时断言 `high/low` metadata 存在且旧字段缺失。
- 删除已无职责的 `merge-k.dto.ts`；实际 HTTP request 仍为 `IndicatorQueryDto`，route 和请求字段不变。
- `git diff` 未触及 `libs/shared-data/src/entities/k.entity.ts`、migration 或 ChanCore algorithm source；
  MySQL 仍使用既有 `high/low` 列，`ChanCore.algorithmVersion` 仍为 1。
- `mist-fe` 的 API types、KPanel、live/snapshot consumer、README 和 20 份 Chan fixture 已递归迁移到
  `high/low`；脚本逐文件证明 fixture 只发生 key rename，值、数组顺序和对象字段顺序均未改变，也未
  添加旧字段 fallback。历史 `docs/superpowers/plans/**` 作为已完成计划证据保留原文，不参与运行时
  contract。
- `mist-skills` 的 data-query/chan-theory 文档、mock 与 contract tests 已迁移到 `high/low`；共享
  `MistClient` 继续透传 backend data，没有转换或 alias。
- 后端集中 Bi 错误文案同步改为 `high/low`；算法局部变量 `highestIndex/lowestIndex` 表达极值索引，
  不属于 wire contract，保持不变。

### 验证记录

- `pnpm run lint:check`：通过。
- `pnpm run typecheck`：通过。
- HTTP 字段定向回归：`chan-core.mapper`、`chan.service`、`chan.controller.openapi`、
  `indicator.controller` 共 4 suites / 10 tests 通过。
- `env TZ=UTC pnpm run test:ci`：受限沙箱首次只有 2 个既有 HTTP integration suites 因
  `listen EPERM 0.0.0.0` 失败；允许绑定本机临时端口后全量重跑 94 suites / 719 tests 通过，另有
  2 suites / 3 tests 按既有条件跳过。
- `pnpm exec nest build chancore`：source move 后通过。
- `pnpm run ci:contracts`：直接从 worktree 执行会把 `.worktrees` 误判为多仓 root；使用临时多仓 root
  将 `mist` 映射到当前 worktree、其余仓库映射到真实兄弟仓后通过。
- `pnpm run build:docker`：`mist`、`chan`、`realtime-subscription-hil` 三个 webpack build 通过。
- `openspec validate --all --strict` 与 `git diff --check`：通过。
- `mist-fe`：ESLint、`tsc --noEmit`、15 suites / 90 tests 和 Next.js production build 通过；生产
  build 首次仅因受限网络无法下载项目既有 Geist 字体失败，允许访问 Google Fonts 后通过。
- `mist-fe` fixture differential：20 个 JSON fixture 均为递归 `highest -> high`、`lowest -> low`
  key-only rename；active README/fixture/application 扫描只剩明确断言旧字段不存在的 negative tests。
- `mist-skills`：按 CI 运行 `uv run ruff check .`、`uv run pyright`、`uv run black --check .` 与
  `uv run pytest`，全部通过（75 tests）；旧字段只存在于 negative contract assertions。
- matching-worktree `pnpm run ci:contracts`：临时多仓 root 将 `mist`、`mist-fe`、`mist-skills` 映射到
  本次三个 worktree，将 datasource/monitoring 映射到真实兄弟仓，验证通过。
- 三仓 `git diff --check` 通过；原 `mist-fe` 与 `mist-skills` 主工作区保持干净。

### Residual work

- Backtest/Realtime/Signal/Alert 对 ChanCore 的采用由各自 focused owning change 决定。
- 除本次价格字段与 OpenAPI 修正外，现有 Chan route/app ownership cleanup 另开 change。
- 公共 Indicator/K API 与 lookback 重构继续由既有独立 change 持有，本 change 不处理。
- backend `feat/extract-chan-core`、frontend `4686f9a` 与 skills `3dcd8d1` 必须协调合并和发布；这不是
  runtime compatibility alias，任一旧消费者与新 backend 混用都会违反契约。
- 归档门禁 4.6 等待项目负责人审阅本节三仓 differential 与 validation evidence。

### Source move 前契约复核

任务 1.9 已逐项对照 `design.md` 与 `specs/chan-analysis-core/spec.md`：

| 契约 | 已固定内容 |
|---|---|
| library/public boundary | `libs/chancore`、`@app/chancore`、四个 facade、最小 public barrel |
| input/output | 完整 readonly `ChanK` 与 MergedK/Fenxing/Bi/Channel 两阶段结果 |
| validation/error | 单一 validator、`ChanInputError`、`ChanInvariantError`、不自动纠错 |
| numeric/mutation | 现有 number 比较、量额只透传、readonly、不承诺引用 identity |
| algorithm identity | `algorithmVersion=1`、full-output fingerprint、宽笔 position distance |
| empty/insufficient | 合法零结果或未完成笔，不升级为错误 |

source move 开始前的 pending tasks 只包含 pure core 与不改变 API 的 wrapper；随后项目负责人明确批准
把 K/Chan HTTP `highest/lowest` 收敛为 `high/low`。该 breaking change 已先回写 proposal/design/delta
specs/tasks，再修改 Controller/VO/OpenAPI，并在再次批准后扩展到匹配 frontend/skills consumer；K
reader、route owner、gateway、deploy、Redis/MySQL persistence 与 migration 仍未进入实施范围。
