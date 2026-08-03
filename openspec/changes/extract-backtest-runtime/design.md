## Context

当前 `POST /v1/strategy-backtests` 在 `apps/mist` 请求进程内创建 `BacktestRun`，一次读取日期范围内
全部历史 K，逐根执行规则并逐条写入 `BacktestSignalResult`，完成后才返回。该实现已有 signal-level
语义、实体、migration 和定向测试，但没有独立资源边界，也尚未使用计划中的 bounded ordered
context。

架构 change 已确认公共策略 API 与计算运行时分离，并采用“同仓 library + 独立 Nest app、暂不拆仓”
方向。回测是长时间、批量、可重放计算，不应进入对延迟敏感的 `apps/signal`，也不应继续占用
`apps/mist` API 进程。

## Goals / Non-Goals

**Goals:**

- 使用项目名 `backtest`、目录 `apps/backtest` 和根模块 `BacktestAppModule` 建立独立回测运行时。
- 保留 `apps/mist` 的公共 API owner 身份，把历史读取、执行和结果写入移出 API 进程。
- 让 backtest 与 realtime 复用同一 pure evaluator、validator 和 analysis contracts；人工执行只创建
  BacktestRun，不保留 manual live-scan 模式。
- 让 Backtest RPC 与公共 HTTP adapter 复用已确认的 shared transport/correlation contract。
- 为历史读取、并发、内存、数据库写入、失败恢复和部署建立有界且可观测的门禁。
- 将 Backtest V1 的 provider scope 固定为 TDX/QMT，并在使用量额规则前验证各自 historical quantity
  profile。

**Non-Goals:**

- 不在本 change 实现 portfolio simulation、交易撮合或收益分析。
- 不让 `apps/backtest` 消费 realtime trigger 或写入 live Signal/PENDING AlertEvent。
- 不恢复 `apps/schedule`，不拆独立仓库，不恢复 Chan persistence。
- 不接入、修复或重新解释 EF historical K，也不为 EF 新增 quantity profile、查询路径或 migration。
- 不增加已确认 `target_issues` 与 pagination index 以外的 schema migration，不设计 feature flag、
  兼容双跑、本地执行 fallback 或专用 rollback 协议。

## Decisions

### 1. 回测 app 使用单词命名

Nest project 名为 `backtest`，目录为 `apps/backtest`，根模块为 `BacktestAppModule`，生产 service
名为 `backtest`。名称只表达产品回测运行时，不使用 `strategy-backtest-worker` 等复合目录名。

### 2. 公共控制面与执行面分离

`apps/mist` 继续持有 `/v1/strategy-backtests` controller、鉴权、请求校验和查询入口。
`apps/backtest` 持有 historical K reading、bounded context、execution、run lifecycle progression
和 `BacktestSignalResult` persistence。

当前 `StrategyBacktestService` 把 create、同步 replay 和 GET query 混在一个 class 中，cutover 时不得
整体原样保留，也不能因为 GET 仍需要 MySQL 而留下旧 executor。`apps/mist` 固定拆成两个 application
service：

- `BacktestRunCommandService` 只负责 StrategyVersion/request 校验、创建 PENDING run、提交 Backtest
  RPC、构造 `BacktestRunReceiptVo` 和执行已确认的提交失败映射；
- `BacktestRunQueryService` 只负责 run/signals 的 MySQL read、状态发布门和 HTTP VO mapping，不发送
  Backtest RPC。

旧 `StrategyBacktestService.executeRun()`、全量 K repository query、逐行 evaluator/result persistence、
为同步回测注入的 `K` repository、`StrategyRuleEvaluator` 和 context builder，以及只验证这些退役行为的
测试必须删除。controller 可以直接注入上述两个 service；不得保留能够在 `apps/mist` 执行 historical
replay 的 facade、未注册 provider 或隐藏 fallback。

发布顺序固定为先部署尚未接收 command 的 `backtest` service 并验证 health/readiness，再部署只通过
RPC 提交的新 `mist-backend`。切换不增加 feature flag、shadow/double-run 或 RPC 失败后的本地执行；
Backtest 不可用时按本 design 的稳定 503/失败收口处理。V1 不为此另建 rollback contract。

Backtest V1 的公共 create contract 只允许 `DataSource.TDX | DataSource.QMT`。HTTP DTO/OpenAPI 必须把
`source` 收窄为 `tdx|qmt`；`ef` 或其他值由 `CreateBacktestRunDto` 在任何 StrategyVersion/MySQL 查询和
`BacktestRun` 创建前返回真实 `400 + VALIDATION_ERROR`。该限制只属于 Backtest HTTP contract，不修改
全局 `DataSource` enum，也不影响其他 datasource API。

`CreateBacktestRunDto.source` 是整个 run 的唯一行情来源，不允许 target item 覆盖 source。runner 对每个
resolved security 都固定查询 `(securityId, run.source, run.period)`；选定 source 没有 K 时保持没有 K，
不得从另一 source fallback、拼接或补齐。所有 target 可以共享同一个 source，但不会把同一证券的
TDX/QMT 行情混进一个 execution context。

TDX 采集当前使用 `front`，QMT 采集当前使用 `front_ratio`。两者不是同一复权契约，但这不属于 evaluator
需要抹平的差异：Backtest 只要求单一 source 内部的价格序列有序、自洽，Indicator 和 strategy rule
原样消费该 provider-defined OHLC。`source` 继续保存在 BacktestRun 并作为查询 provenance；V1 不增加
`adjustmentMode` 字段、price normalization、跨 source equivalence test 或 migration。两个分别选择 TDX
和 QMT 的 run 是两个独立实验，结果和信号时间不保证相同或可直接比较。未来如果修改某 source 的固定
复权设置，必须由 owning datasource/history change 评审其存量一致性，不能由 strategy engine 静默兼容。

为了使启动补偿面对历史或异常数据仍然 fail closed，runner 在 claim 后、第一次 historical page query
前验证 persisted run source。PENDING EF/未知 source 进入既有 runner-owned FAILED 路径，安全失败类固定为
`BACKTEST_SOURCE_UNSUPPORTED`，不得查询 EF K、调用 provider 或猜测 mapping；已有 COMPLETED/FAILED run
仍可按既有 GET resource 契约查询。本 change 不清理、改写或迁移存量 EF run。

V1 不新增 Redis/BullMQ backtest queue。`apps/mist` 将合法请求登记为 MySQL PENDING
`BacktestRun`；该记录同时是权威任务 identity 和查询入口。领取后的状态推进和结果写入由
`apps/backtest` 持有。

内部 RPC envelope、Backtest pattern/payload/result、非目标数据库错误、run query、V1 不支持用户
取消、partial-result visibility、result unique conflict、signals 分页和 cutover 已经确认。实现仍须
遵守前置 change、真实 schema、MySQL query plan、部署和 HIL 门禁。

`POST /v1/strategy-backtests` 的职责只到“登记并提交一次回测运行命令”。`apps/mist` 完成请求校验、
持久化 PENDING `BacktestRun`，并收到 TCP handler 的 accepted response 后，必须立即返回
`202 Accepted`，不得等待 runner 开始或历史回放完成。

公共响应使用 `libs/transport/http`。HTTP status 与 success envelope `statusCode` 都是 `202`，
message 为显式 `BACKTEST_ACCEPTED`，`data` 使用
`apps/mist/src/strategy/vo/backtest-run-receipt.vo.ts` 的 `BacktestRunReceiptVo`，只包含 `runId` 和
固定的 `initialStatus=PENDING`，同时返回 `Location: /v1/strategy-backtests/{runId}`。`initialStatus`
只表示 command 被持久登记时的初始状态，不是响应时的当前状态；即使 worker 已推进到 RUNNING、
COMPLETED 或 FAILED，也不得为了刷新 POST receipt 再查询数据库。客户端必须通过
`GET /v1/strategy-backtests/{runId}` 读取当前状态，并通过既有
`GET /v1/strategy-backtests/{runId}/signals` 读取结果。POST response 不得内嵌 signal rows、aggregate
statistics 或伪造独立 `commandId`，因为 `BacktestRun.id` 本身就是持久 command identity。

`BacktestRunReceiptVo` 是独立的 accepted receipt 类型，固定字段为正 safe integer `runId` 和字面量
`initialStatus: 'PENDING'`，再由 `ApiResponseDto<BacktestRunReceiptVo>` 包装；它不得复用或裁剪
`BacktestRunVo`。timeout readback 已确认 RUNNING、COMPLETED 或 FAILED 后返回的正常 `202` 也使用同一
receipt，且 `initialStatus` 仍表示该 run 的创建初态，不伪装成当前状态。

run query 继续由 `apps/mist` 直接读取 MySQL，不经过 Backtest RPC，也不依赖 `backtest.ready`。
HTTP 输入使用 `apps/mist/src/strategy/dto/backtest-run-id-param.dto.ts` 的
`BacktestRunIdParamDto`，只接受正 safe integer `runId`；该参数仍指向现有 `BacktestRun.id`，
不建立第二个 identity。HTTP 业务输出使用
`apps/mist/src/strategy/vo/backtest-run.vo.ts` 的 `BacktestRunVo`，再由 shared
`ApiResponseDto<BacktestRunVo>` 包装。controller 不得直接把 TypeORM `BacktestRun` entity 当作
公共 OpenAPI 契约。

`BacktestRunVo` 保持现有公共 JSON 字段：

- `id`、`strategyDefinitionId`、`strategyVersionId`、`targetUniverse`、`period`、`source`、
  `startDate`、`endDate` 和 `status`；
- `signalCount`、`matchedSecurityCount`；
- `targetIssues`，始终为 `BacktestTargetIssueVo[]`；
- nullable `startedAt`、`completedAt`、`errorMessage`；
- `createdAt`、`updatedAt`。

该 change 不把返回字段 `id` 破坏性重命名为 `runId`。除新增非空、默认空数组的
`backtest_runs.target_issues` JSON 列外，不修改现有数据库 column/nullability。
PENDING、RUNNING、COMPLETED 和 FAILED 都是已存在 run 的正常资源状态，统一返回真实
`200 + ApiResponseDto<BacktestRunVo>`；FAILED 不转换为 HTTP 500。两个 count 字段继续保持
number，但只有 COMPLETED 时才是最终统计；非终态返回的默认 `0` 不能被解释为已完成的零结果。

run query 的错误边界固定为：

- 非法 `runId` 在 DTO validation 层返回 `400 + VALIDATION_ERROR`，不得进入 TypeORM；
- `findOne()` 成功返回 null 时，由 application service 解释为
  `200 + success=false + BACKTEST_RUN_NOT_FOUND`；
- TypeORM/MySQL 异常不在 repository 或普通 service catch、重试或 readback，由 shared HTTP
  边界返回 `500 + INTERNAL_ERROR`；
- 其他未预期异常同样由 shared HTTP 边界返回 `500 + INTERNAL_ERROR`；
- 上述 query error 不返回 `ApiErrorDto.data` 或 `Location`，成功与失败复用当前请求唯一
  `requestId`，数据库/内部异常只由最终 HTTP 边界记录一次带 operation、runId 和内部证据的
  权威日志。

`BacktestRunVo.errorMessage` 保留兼容字段名，但只能暴露已批准、长度有界的稳定 Backtest 失败类；
不得返回 SQL、driver message、stack 或任意原始异常。未识别的历史字符串映射为安全的
`BACKTEST_EXECUTION_FAILED`。该 read mapper 不改写数据库，不增加 migration、自动修复、retry、
readback 或 fallback。

POST accepted data 与 run resource 是两个公共类型：调用方先使用 POST 返回的 `runId` 跟随
`Location` 查询 `BacktestRunVo`，只在 run GET 返回 COMPLETED 后请求 signals。PENDING/RUNNING
可以继续轮询，FAILED 读取安全 `errorMessage`。本 change 只提供后端/OpenAPI 契约和 consumer
contract tests，不修改 `mist-fe`；实际页面状态、toast 和详情展示由独立前端 change 实现。

#### 2.1 逐目标业务缺口使用持久化 issue，不新增 PARTIAL 状态

`BacktestRun` 新增物理列 `target_issues`，TypeORM 属性和公共 VO 字段为 `targetIssues`。它是 JSON
NOT NULL array，创建 PENDING run 时固定为 `[]`；migration 使用 MySQL 8.4 可接受的空 JSON 数组
默认表达式，使升级期间旧应用插入仍得到空数组。存量 run 只得到 `[]`，不得根据历史结果反推 issue。

公共元素类型固定为：

```ts
type BacktestTargetIssueCode =
  | 'SECURITY_NOT_FOUND'
  | 'NO_HISTORICAL_BARS';

class BacktestTargetIssueVo {
  securityCode: string;
  code: BacktestTargetIssueCode;
}
```

`BacktestRunVo.targetIssues` 在所有状态都必须存在。PENDING/RUNNING 为 `[]`；终态只返回 runner 在终态
事务中持久化的安全结构，不携带 raw exception、SQL、provider payload 或任意 message。相同规范化
securityCode 与 code 最多保存一次，按请求中首次出现的目标顺序稳定输出。数组天然受输入
`targetUniverse` 约束，V1 不为此再增加 target 数量 cap、`hasWarnings`、processed count 或新 endpoint；
`matchedSecurityCount` 仍只表示最终产生 signal 的证券数。

边界固定如下：

- DTO 层对空项、非法格式或空 universe 返回 `400 + VALIDATION_ERROR`，不创建 run；
- 语法合法但在 Security registry 中不存在的目标记录 `SECURITY_NOT_FOUND` 并跳过；
- 目标能够解析，但选定 source/period 在公开 `[startAt,endAt]` 区间没有任何 persisted historical K，
  记录 `NO_HISTORICAL_BARS` 并跳过。只有 seed K、公开区间无 K 仍属于该情况；
- “可执行目标”在 V1 只要求能够解析且公开区间至少有一根 historical K，不要求策略一定得到 boolean
  结果。指标预热不足、previous/crossover 缺前值或 quantity 全程 unavailable 导致所有 bar 都是
  `unknown/unavailable` 时，仍按正常零信号目标处理，不记录 issue；
- 至少一个目标可执行时，runner 可正常完成，并在同一个 RUNNING → COMPLETED 短事务中写最终
  count 与完整 `targetIssues`。正常执行但没有任何 signal 是合法 COMPLETED，且不产生 issue；
- 非空 universe 的全部目标都被上述两类业务缺口跳过时，runner 在一次短事务中条件推进为 FAILED，
  写入 `BACKTEST_NO_EXECUTABLE_TARGETS` 和完整 `targetIssues`，并仅在条件更新成功时删除部分结果；
- MySQL/TypeORM、K invariant、quantity mapping、Indicator/evaluator、result persistence 或其他未知
  程序异常继续使整个 run 进入既有 runner failure cleanup。它们不能被 catch 后追加 target issue
  并继续，也不能降级为 COMPLETED warning；该类失败不保存可能因遍历顺序而不完整的 issue 数组。

这一契约提供 V1 用户提醒所需的查询面，而不是增加主动投递：调用方轮询 run GET，在首次观察到
终态时可按 `status + targetIssues.length` 区分完全成功、完成但跳过部分目标、全部目标不可执行和
系统失败。run GET 仍是 HTTP `200 + SUCCESS` 的资源读取，warning 不修改 envelope message；本 change
不增加 WebSocket、SSE、webhook、WeCom、AstrBot、AlertEvent 或 notification queue。页面关闭后 V1
不会站外提醒。

V1 明确不支持用户取消回测。该决定意味着：

- 不新增 `/v1/strategy-backtests/{runId}/cancel` 或其他 cancel HTTP route，也不新增
  `CancelBacktestRunDto`、cancel VO 或 OpenAPI operation；本 change 同样不包含任何 frontend action；
- 不新增 cancel RPC pattern、database cancellation intent、cooperative cancellation token 或
  本地队列移除协议；
- `BacktestRunStatus` 和 MySQL enum 继续只有 PENDING、RUNNING、COMPLETED、FAILED，不新增
  CANCELLING/CANCELLED，也不增加 `cancelRequestedAt/cancelledAt` 或相关 migration；
- 不允许通过删除 `BacktestRun`、删除等待队列元素或把用户动作伪装成 FAILED 来实现隐式取消；
- PENDING/RUNNING run 一旦持久化，只能由现有生命周期进入 COMPLETED 或 FAILED；HTTP 客户端断开、
  停止轮询或关闭页面不得撤销 run；
- historical paging、run deadline 和资源 hard limits 仍必须有界。deadline、进程中断、数据库错误
  和其他执行失败使用各自稳定失败类进入 FAILED，它们不解释为取消；
- 不新增 cancel metric、alert 或 deployment 配置。未来需要用户取消时，必须创建独立 OpenSpec，
  逐项设计状态、migration、HTTP/RPC、队列/runner 竞态、partial result cleanup、前端和监控。

partial-result visibility 固定采用“物理分批提交、状态门控发布”：

- runner 可以在 RUNNING 期间以有界 batch 提交 `BacktestSignalResult`，避免把整轮历史回放、历史
  K 查询或结果写入包在一个长事务中；这些已提交行仍是内部未发布数据；
- result buffer 使用 `apps/backtest` 内部固定常量 `BACKTEST_RESULT_BATCH_SIZE = 100`。每个 active run
  持有自己的 buffer，最多保留 100 个完整待写入 result；不得与其他 run 共用 mutable batch，也不得
  缓存 raw K。达到 100 条时使用一个短的 TypeORM multi-row insert 提交，成功后才能清空 buffer；
- replay 结束时若 remainder 为 1–99 条，必须先提交该 remainder；零条时不得执行空 insert。只有
  remainder 成功后才允许进入最终完成事务。batch size 与 `REPLAY_PAGE_SIZE=1000` 职责分离，不因
  page/group 边界扩大，group 边界也不要求强制 flush；
- `BACKTEST_RESULT_BATCH_SIZE` 不是环境变量、HTTP/RPC 字段、strategy option 或动态调优入口。V1
  不增加第二套 config/fallback；实现和测试直接共享该常量；
- 任一 batch insert 失败时立即停止该 run，不逐行 fallback、不二分重试、不跳过坏行，也不重放
  当前 batch。错误进入既有 non-target persistence failure，已提交的早期 batch 由条件 FAILED 的
  cleanup 统一删除；buffer 必须在 run 结束或 slot 释放时清空；
- 所有 result batch 必须在最终状态推进前完成。runner 只在结果已经全部持久化并计算出最终 count
  后，才以 `status=RUNNING` 前置条件短事务推进到 COMPLETED 并写入最终 count；COMPLETED 之后不得
  再写该 run 的结果；
- `GET /v1/strategy-backtests/{runId}/signals` 必须先读取权威 `BacktestRun` 状态。PENDING 或
  RUNNING 返回 `200 + success=false + BACKTEST_RESULTS_NOT_READY`，FAILED 返回
  `200 + success=false + BACKTEST_RESULTS_UNAVAILABLE`；这两个业务拒绝的 body `statusCode` 必须
  与真实 HTTP 一致为 `200`，稳定机器码放在 `ApiErrorDto.code`，typed `ApiErrorDto.data` 只包含
  `{runId,status}`，不得返回任何部分结果；
- 只有 COMPLETED 返回 `200` 的最终 result collection；COMPLETED 且零匹配必须是合法空集合，
  不能与“尚未完成”的 `success=false` 业务拒绝混淆。run 不存在使用
  `200 + success=false + BACKTEST_RUN_NOT_FOUND`，数据库与未知程序错误统一使用
  `500 + INTERNAL_ERROR`；
- signals 分页不得绕过上述状态发布门；只有 COMPLETED 才进入结果 page query。

signals GET 固定使用以下 HTTP DTO/VO：

- path 继续使用 `BacktestRunIdParamDto`；
- query 使用 `BacktestSignalResultQueryDto`，只接受可选 `cursor: string` 和
  `limit: integer`；cursor 非空时最大 `512` 字符，limit 默认 `50`、范围 `1–100`，非法值返回
  `400 + VALIDATION_ERROR`；
- item 使用 `BacktestSignalResultVo`，显式包含现有公共字段 `id`、`backtestRunId`、
  `securityCode`、`signalTime`、`contextSnapshot`、`ruleSnapshot` 和 `createdAt`；时间输出为
  ISO string，snapshot 为非 null JSON object，controller 不得返回 TypeORM entity；
- page 使用 `BacktestSignalResultPageVo`，只包含
  `items: BacktestSignalResultVo[]` 和 `nextCursor: string|null`，再由
  `ApiResponseDto<BacktestSignalResultPageVo>` 包装。page 不重复返回 total；最终总数由已查询的
  `BacktestRunVo.signalCount` 持有。

结果按 `signalTime ASC, id ASC` 稳定排序。`id` 只作为相同 signalTime 的 total-order
tie-breaker，不把公共顺序改为数据库插入顺序。cursor 是服务端生成、客户端不解析的 opaque
Base64URL token，内部固定只包含 cursor version、runId、signalTime 和 id。V1 内部系统不为 cursor
增加签名、加密、密钥配置或轮换；token 不承载秘密，SQL 仍以 path runId 限定数据作用域。decoder 必须
拒绝空字符串、padding、非 Base64URL 字符、超过 512 字符、额外字段，以及版本/类型/时间不合法、
runId/id 不是正 safe integer 或 token runId 与 path runId 不一致的输入；统一返回
`400 + VALIDATION_ERROR`，且不得进入结果查询或在日志中记录原始 cursor。客户端仍只能把 token 当作
opaque string，不得依赖其内部 JSON。

查询使用 keyset pagination，而不是 offset：

```sql
WHERE backtest_run_id = :runId
  AND (
    signal_time > :signalTime
    OR (signal_time = :signalTime AND id > :id)
  )
ORDER BY signal_time ASC, id ASC
LIMIT :limitPlusOne
```

首页省略 cursor。每页最多查询 `limit + 1` 行；存在额外行时，只返回前 limit 行并从最后一个返回
item 生成 nextCursor，否则 nextCursor 为 null。不得为 page 额外执行 `COUNT(*)`，也不得自动读取
后续页。因为 2.17 要求所有 batch 先持久化、再推进 COMPLETED，且 COMPLETED 后禁止写入，分页读取
的是不可变结果集，不需要 snapshot token、跨页事务、readback、retry 或临时表。

现有 `idx_backtest_signal_results_run_id` 和
`uq_backtest_signal_results_run_security_time` 不能同时覆盖 run filter 与
`signalTime,id` 顺序。完成真实 `schema_migrations`、index inventory 和代表性大 run
`EXPLAIN` 后，必须使用独立的 forward-only pagination-index migration 和同名 entity metadata 增加：

```text
idx_backtest_signal_results_run_time_id
(backtest_run_id, signal_time, id)
```

仓库 migration 文件当前连续到 `013`，所以候选序列是：

1. `014_add_backtest_target_issues.sql`：只对 `backtest_runs` 执行一次 `ALTER TABLE`；
2. `015_add_backtest_result_pagination_index.sql`：只对 `backtest_signal_results` 执行一次
   `ALTER TABLE`。

现有 runner 通过 `multipleStatements=true` 执行整个文件，并只在文件完全成功后写入
`schema_migrations`；MySQL DDL 不受该文件级登记原子保护。因此两个对象不得放入同一个 migration
文件，否则第一条 DDL 已提交而第二条失败时，文件未登记且无法直接安全重跑。拆分后每个文件只有
一个 DDL 并分别登记：`014` 成功而 `015` 失败时，下一次只需跳过已登记的 `014` 并重新运行 `015`。

真实 `schema_migrations` 未验证时不得创建、执行或宣称已经固定 `014/015`；inventory 必须同时证明
两个编号未被生产使用、`target_issues` 不存在且 pagination index 不存在。不得仅凭仓库文件猜测
migration 编号，也不得修改现有 unique、列或数据。preflight 必须确认同名/同列组索引
状态，postflight/readback 必须确认索引列序、non-unique 和分页 query plan；生产应用遵循数据库
备份和 repair-forward 门禁。

HTTP contract 支持 consumer 在 run COMPLETED 后只请求第一页，并通过 nextCursor 按需读取后续页；
consumer 不需要解析 cursor 或自动 drain 所有页。实际 `mist-fe` page state、加载更多与展示实现由
独立前端 change 处理。当前工作区未发现 `mist-skills`、monitoring、deploy 或 datasource signals
consumer；实现前仍需再次检索。

所有 runner-owned 执行失败与启动时遗留 RUNNING 收口共用同一 cleanup 不变量：在一次短事务中先
条件推进 PENDING/RUNNING → FAILED，再且仅在 `affected=1` 时删除该 run 的全部
`BacktestSignalResult`。`affected=0` 时不得删除，避免 completion 已提交但 response 丢失时误删
合法 COMPLETED 结果。cleanup 自身失败时不递归重试或伪造成功；公共 signals API 仍由状态门控，
因此失败或未完成的 run 不会泄漏物理部分行。该设计不新增 `isPartial`、`published`、staging table、
result schema 字段或 migration，也不在读取时自动修复历史数据。

已创建 run 的提交失败按以下顺序映射：

- TCP handler 明确返回 `queue_full` 时，`apps/mist` 先以 `status=PENDING` 条件将 run 标记 FAILED；
  条件更新成功后返回 `429 + BACKTEST_QUEUE_FULL`；
- `backtest.ready=false` 时返回 `503 + BACKTEST_NOT_READY`；TCP 连接失败时返回
  `503 + BACKTEST_UNAVAILABLE`；两者仍须先以 `status=PENDING` 条件标记 FAILED；
- TCP response timeout 后仍能以 `status=PENDING` 条件标记 FAILED 时，返回
  `504 + BACKTEST_COMMAND_TIMEOUT`；
- TCP response timeout 后 PENDING-to-FAILED 条件更新影响 `0` 行时，必须 read back run。若已是
  RUNNING、COMPLETED 或 FAILED，说明 command 已被接受，返回正常的 `202 Accepted`，不得把 run
  回滚；若仍为 PENDING 或资源 missing，返回 `500 + INTERNAL_ERROR`；readback 自身失败也返回
  `500 + INTERNAL_ERROR`，不得继续 readback、cleanup 或 resend；
- 任何上述非 202 响应，只要 `BacktestRun` 已创建，就必须使用 shared `ApiErrorDto.data` 返回
  `runId` 和当前 FAILED 状态，并设置同一个 run `Location`。客户端不得对该失败 run 自动重试；
  用户再次提交时创建新的 run identity。

该映射只覆盖可识别的 command handoff 结果。数据库写入失败、条件更新/readback 失败和其他
non-target errors 不能伪装成 `queue_full`、`not_ready`、`run_failed` 或 TCP unavailable。

公共 HTTP 的非目标数据库错误固定使用以下边界：

- 在 PENDING `BacktestRun` 提交前，StrategyVersion 查询、run 创建或事务失败时，返回
  `500 Internal Server Error`，`ApiErrorDto.code=INTERNAL_ERROR`，省略 `data` 和
  `Location`；
- PENDING run 已提交且 `runId` 已知后，后续条件更新或 readback 自身发生数据库错误时，返回
  `500 + INTERNAL_ERROR`，`ApiErrorDto.data` 只包含 `{runId}` 并保留 run-resource
  `Location`；不得返回未确认的 `status`；
- `GET /v1/strategy-backtests/{runId}` 或 signals 查询发生数据库错误时，返回 `500` 和
  `INTERNAL_ERROR`，不得伪装成 `BACKTEST_RUN_NOT_FOUND` 业务拒绝或成功空集合；
- 只有查询成功返回 not-found、空集合或条件更新 `affected=0` 时，才按业务状态解释；这些成功结果
  本身不属于数据库错误。

已知 run identity 后，HTTP orchestration 边界可以捕获数据库异常并构造只含安全 identity 的
structured `HttpException`；该 catch 只负责公共 resource identity，不得改写底层异常分类、自动
重试或泄漏 SQL/driver message。

远端 handler 通过 RPC error channel 返回 `RPC_INTERNAL_ERROR` 时，`apps/mist` 只执行一次
PENDING-to-FAILED 条件更新：

- 条件更新成功时，返回 `500 + INTERNAL_ERROR`，`ApiErrorDto.data` 包含已确认的
  `{runId,status:FAILED}` 并保留 `Location`；
- 条件更新影响 `0` 行时，执行一次必要 readback；RUNNING 或 COMPLETED 证明 command 已被领取，
  因此返回正常 `202`；已是 FAILED 时返回 `500 + INTERNAL_ERROR`，并保留已确认的
  `{runId,status:FAILED}` 与 `Location`；
- 条件更新或 readback 自身发生数据库错误时，回到上述
  `500 + INTERNAL_ERROR + data({runId}) + Location`，不返回 status；
- 任何分支都不得自动重发 RPC。

所有正常 POST 和启动补发共用一个端到端 timeout：`BACKTEST_COMMAND_TIMEOUT_MS`。该配置属于
发送方 `apps/mist`，必须由 `libs/config` 的 `mistEnvSchema` 使用
`integer().min(500).max(30000).default(3000)` 校验，再通过 Nest `ConfigService` 注入 command
client。业务代码不得直接读取 `process.env`，也不得另设 connect timeout、response timeout 或
硬编码 fallback。

timeout 从 `ClientProxy.send()` request-response subscription 开始，覆盖建立/取得 TCP 连接、
`@MessagePattern` handler 校验、入队或幂等判断以及 accepted/rejected response，总预算默认
`3000ms`。timeout 只触发已确认的 PENDING 条件更新与 readback；client 不得自动再次发送同一个
command。显式启动补发是唯一允许的恢复路径，且同样受该 timeout 约束。

### 3. NestJS TCP 是正常触发边界

`apps/mist` 在 PENDING `BacktestRun` 提交后，使用与 NestJS 10 对齐的
`@nestjs/microservices` `Transport.TCP` ClientProxy，以 request-response 方式发送
`backtest.run.submit.v1`。pattern 本身承担 wire version；payload 不重复放置 `contractVersion`。

request 使用 `libs/transport/rpc` 的 `RpcRequestV1<SubmitBacktestRunCommandV1>`：
`SubmitBacktestRunCommandV1` 只含正安全整数 `runId`，`meta.correlationId` 必填并复用当前 HTTP
requestId 或启动补偿边界生成的 correlation。
不得复制 strategy rule、历史 K、target universe、结果字段或另建 `commandId`。

handler result 使用
`RpcResultV1<null, SubmitBacktestRunErrorCodeV1>`，其中 error union 固定为
`'queue_full' | 'not_ready' | 'run_failed'`，并原样 echo correlation：

- 新 run 成功入队、同一 run 已在等待集合、已 RUNNING 或已 COMPLETED，返回 `ok=true,data=null`；
- queue capacity 已满返回 `ok=false,error.code=queue_full`；
- startup reconciliation 未完成返回 `ok=false,error.code=not_ready`；
- run 已 FAILED 返回 `ok=false,error.code=run_failed`，不得伪装为幂等 accepted；
- 缺失/非法 correlation、非法 runId、run 不存在或非预期数据库异常不伪造上述业务 code，走严格
  validation 或 Nest RPC error channel。

`apps/backtest` 必须注册 `@app/transport/rpc` 的 shared RPC exception filter。非预期数据库或
程序异常在服务端日志中保留 application、pattern、runId、correlation、阶段和原始异常，但 wire
只返回固定 `{status:error,message:RPC_INTERNAL_ERROR}`。`apps/mist` 必须从正常
`RpcResultV1`、本地 TCP connection/timeout 和远端 RPC error channel 三类结果中精确区分；
`RPC_INTERNAL_ERROR` 不得被映射为 `429`、`503` 或任意 Backtest 业务 rejection。

`RpcRequestV1/RpcResultV1` 只定义通用 envelope；Backtest pattern、command、error-code union 与
decoder 位于 `libs/backtest/src/contracts`，由 `@app/backtest` barrel 同时提供给 caller 与 handler，
不得进入 `libs/transport`、`libs/strategy` 或任一 app source。`correlationId` 只用于观测，不参与 run 幂等；唯一
durable command identity 仍是 `BacktestRun.id`。

`apps/backtest` 使用 `@MessagePattern` 接收 message，严格验证 envelope 和 run 状态，并把 runId 放入
单实例的 bounded local execution queue。handler 只返回 accepted/rejected，不等待历史回放完成；
runner 真正开始计算前再以 `status=PENDING` 条件原子转换为 RUNNING。

如果发送超时、连接失败或 handler 拒绝，`apps/mist` 只允许以 `WHERE status=PENDING` 将 run 标记为
FAILED。若消息实际已被处理并进入 RUNNING，该条件更新必须无效果，不能回滚 worker 状态。

### 4. 本地执行并发与等待队列容量使用共享配置

V1 使用单实例 FIFO 本地等待队列。`BACKTEST_QUEUE_CAPACITY` 表示尚未开始执行的最大排队数量；
当前正在执行的 run 不占用该等待容量，同一个 `runId` 重复到达时不得重复占位。

该配置必须在 `libs/config` 新增的 `backtestEnvSchema` 中作为正整数统一校验，并由
`apps/backtest` 通过 Nest `ConfigService` 注入队列组件。队列、handler 或 executor 不得直接读取
`process.env`，也不得在应用源码中另设一套硬编码容量。Joi 契约固定为整数、默认 `8`、最小 `1`、
最大 `64`；配置缺失时由 schema 产生默认值 `8`，非法显式值必须导致应用启动校验失败。

同一 `backtestEnvSchema` 还必须校验 `BACKTEST_CONCURRENCY`：正整数、默认 `2`、最小 `1`、最大
`8`，并通过 `ConfigService` 注入 execution scheduler。单个 Compose service 可以同时持有最多该值
个 RUNNING execution slot；每个 run 独立持有 context、Indicator、quantity projector、result batch、
deadline 和 cleanup boundary，不能共享 mutable evaluation state。同一个 runId 最多处于一个 active
slot 或一个 waiting position。

command admission 必须先通过 strict validation/readiness，再按 `runId` 使用短生命周期 keyed promise
chain 串行化。chain 内先检查 active/waiting identity，再读取权威 run state：waiting、RUNNING 或
COMPLETED 返回幂等 accepted；FAILED 返回 `run_failed`；只有新的 PENDING 才进入 capacity decision。
dedupe 必须早于 queue-full 判断，重复 command 不得因当前 capacity 已满被拒绝。

不同 run 的状态查询可以并发；同一 run 的 chain 内，capacity check 与 active/waiting reservation
之间不得 await，利用单 Node event loop 同步完成内存原子决策。chain settled 后删除，不能随历史 run
数量增长；active/waiting identity 则由 scheduler 生命周期单独管理。每个 command 根据自己的
correlation 重新构造 RpcResult，不得缓存复用第一条完整 result，否则不同 correlation 会被错误 echo。

handler `ok=true` 只表示当前进程已经接受 command；waiting run 和尚未由 runner 取得 slot 的 run 在
MySQL 继续保持 PENDING。runner 真正开始前才执行 `UPDATE ... WHERE id=? AND status=PENDING` 原子
claim 为 RUNNING，不新增 durable reservation 状态。进程在 memory reservation 后退出时，内存状态
消失而 durable PENDING 留给下一次启动的一次性 compensation；运行期间不增加 scanner/reconciler。

若 API 因 response loss/timeout 已把 run 条件标记 FAILED，runner claim `affected=0` 时必须直接丢弃
该 memory identity，不执行、不 readback、不把状态改回 PENDING，并释放 slot、尝试调度至多一个最老
waiting run。claim query 抛错时，runner failure boundary 只尝试一次 PENDING→FAILED cleanup；cleanup
失败只记录 authoritative error，不递归重试。所有出口必须在 finally 中 exactly-once release slot。

waiting→active 的 FIFO shift、active reservation 和 runner scheduling 构成无 await 的同步调度步骤；
schedule runner 若同步抛错必须撤销 active reservation 并进入任务失败收口。每次 release 只能 admit
至多一个最老 waiting identity，任何数据库或调度异常不得永久占用 execution slot。

Node 单进程的 V1 concurrency 只承诺多个 run 在数据库 I/O 与显式 event-loop yield boundary 之间
并发推进。每个 run 使用独立内部常量 `BACKTEST_CALCULATION_BATCH_SIZE = 100`：同一组的 canonical K
仍按 timestamp 顺序逐根执行 projector、Indicator 和 evaluator，不在 batch 内 `Promise.all` 或并行。
每实际消费 100 根 K 后，runner 必须检查 deadline，并通过 promise-based `setImmediate` 让出一次
event loop；`Promise.resolve()` microtask 或 `setTimeout(0)` 不得冒充该边界。

每个 replay page 结束时也必须检查 deadline 并给其他 active run 一次调度机会；如果 page end 与第
100 的整数倍重合，只执行一次 yield。最后一页少于 100 根时仍在 page end yield。seed K 同样会进入
projector 并消耗 CPU，因此复用现有 `consumedBarCount` 参与 calculation boundary 计数；yield 等待属于
claim 后的 wall-clock execution deadline，不转换为 CPU-time budget，也不释放 execution slot。

`BACKTEST_CALCULATION_BATCH_SIZE` 与 `BACKTEST_RESULT_BATCH_SIZE` 即使 V1 数值同为 100，仍是两个职责
明确的内部常量：前者约束同步计算占用 event loop 的连续长度，后者约束待写 JSON result buffer；不得
合并为模糊 `BATCH_SIZE`，也不得进入环境变量、HTTP、RPC 或 strategy definition。

V1 不引入 worker_threads、不启动多个 Backtest service 实例，也不宣称多核 parallel execution。真实
MySQL pool、CPU、heap 和 event-loop delay 必须在默认 2 及边界 1/8 下测量；证据不足时不得提高生产
配置。

V1 不在 Compose 中为 Backtest service 新增 CPU/内存 hard limit 或 reservation，也不增加相应 env、
配置 schema 或启动校验。资源边界只由已确认的 run concurrency、waiting capacity、wall-clock
deadline、consumed-bar limit、replay page 和 calculation/result batch 共同约束；HIL 记录真实占用用于
后续调整 `BACKTEST_CONCURRENCY`，但不把未经测量的 CPU/内存数字变成本 change 的发布门禁。

`BACKTEST_CONCURRENCY` 是 run-level execution-slot 配置，不是单个 run 的证券并行度。V1 对一个 run
解析、去重后的 `(securityId,source,period)` group 逐组串行 replay；不增加 intra-run concurrency、
worker pool、batch fan-out 或第二个配置。具体先处理哪个 securityId 是 executor 私有实现细节，不进入
HTTP/RPC、结果 schema 或业务语义。每个 group 必须拥有独立 bounded context、Indicator 和 projector
状态；只要每组有序 K 相同，改变内部 group 遍历顺序不得改变最终 domain signal 集合或完成统计。

只有所有 execution slot 均被占用且 waiting queue 已达到容量时，`@MessagePattern` handler 才返回稳定
的 `queue_full` rejection；有空闲 slot 时新 run 可直接进入 claim/execution，不先占 waiting capacity。
`apps/mist` 仍只允许以 `status=PENDING` 条件将对应 run 标记 FAILED。

### 5. 每个 active run 使用独立协作式 deadline

`apps/backtest` 的 `backtestEnvSchema` 必须校验 `BACKTEST_RUN_TIMEOUT_MS`：整数、默认
`1800000ms`（30 分钟）、最小 `60000ms`、最大 `86400000ms`，并通过 Nest `ConfigService` 注入
runner。executor 不得直接读取 `process.env` 或设置另一个硬编码 fallback；该值不进入 HTTP、RPC、
strategy definition 或其他调用方输入。

每个 execution slot 在自己的 PENDING → RUNNING 原子领取成功后记录独立 deadline，waiting queue 中
的排队时间不消耗该预算。runner 必须在请求历史 K page 前后、每个有界计算批次前后、结果 batch
落库前后以及 RUNNING → COMPLETED 提交前检查同一 deadline；一个 run 的 clock、deadline 和 timeout
cleanup 不能与其他 active run 共享 mutable state。

deadline 被观察为到期时，runner 停止当前 run 的后续计算和写入，使用现有 runner-owned 单次短事务
将仍为 RUNNING 的 run 标记 FAILED、写入稳定失败类 `BACKTEST_EXECUTION_TIMEOUT`，并仅在条件转换
成功时删除该 run 的部分 `BacktestSignalResult`。无论 cleanup 成功或失败，该 execution slot 都必须
隔离并释放，scheduler 继续接纳最早 waiting run；其他 active run 不受影响。超时 run 不自动重试、
续跑、恢复或重新入队，用户显式重跑仍创建新的 run identity。

这是安全边界上的 cooperative deadline，不是假装可抢占 Node 同步代码或取消已发送的 MySQL
driver operation。V1 不使用 `Promise.race` 把仍在后台执行的 query 伪装成已取消，也不为 deadline
引入 worker_threads；若控制权在 deadline 后才从同步批次或数据库调用返回，则在下一个规定边界
观察超时并收口。driver/query timeout 属于独立数据库资源边界，不能由该 run deadline 冒充。

#### 5.1 每个 run 只使用一个实际消费 K 总数上限

`backtestEnvSchema` 同时校验 `BACKTEST_MAX_BARS_PER_RUN`：整数、默认 `10000000`、最小 `10000`、
最大 `50000000`，并通过 `ConfigService` 注入 runner。该值不进入 HTTP、RPC、strategy definition 或
调用方输入，业务代码不得读取 `process.env` 或设置另一套 fallback。

公共 `targetUniverse` 输入必须至少包含一个语法合法元素。runner 将其映射为 securityId，并按
securityId 去重；同一证券重复出现不能形成重复 replay group 或重复计数。HTTP DTO 已阻止的空/非法
universe 若因异常存量数据进入 runner，则在读取 historical K 前以稳定
`BACKTEST_TARGET_UNIVERSE_EMPTY` 进入 FAILED cleanup；语法合法但 Security registry 不存在的目标不
属于该错误，按 2.1 的 `SECURITY_NOT_FOUND` 处理，全部如此时使用
`BACKTEST_NO_EXECUTABLE_TARGETS`。

每个 run 维护一个跨全部去重后 `(securityId,source,period)` group 的 `consumedBarCount`。每根通过
persistence mapping、将要进入 projector/evaluator 的 canonical historical bar 计数一次；为日内
`startAt` 建立 quantity forward-fill 状态而读取的 seed bar 同样消耗额度，因为它实际占用数据库、CPU
和 projector 资源。结果发布区间外的 seed 不产生 Signal result，但不能从资源统计中消失。

`consumedBarCount === BACKTEST_MAX_BARS_PER_RUN` 仍合法；准备消费下一根时，runner 不再处理该 bar，
停止该 run 的后续 page/evaluation/result 写入，并通过既有单次短事务以稳定失败类
`BACKTEST_BAR_LIMIT_EXCEEDED` 条件推进 RUNNING → FAILED、删除部分结果、释放 execution slot。该路径
不发布部分成功、不自动缩短请求范围，也不重试、续跑或重新入队；其他 active run 继续执行。

V1 不为不同 period 维护日期跨度矩阵，不另设 target count、result count 或 date-range cap，也不在
执行前使用 `COUNT(*)` 估算总 K。分页固定限制单次 I/O/内存，deadline 限制时间，本计数只限制实际
消费的总工作量；三者职责不重叠。未来只有真实负载证据证明需要另一种独立资源边界时再单独评审。

### 6. 只在启动时补偿

正常运行期间不周期扫描 PENDING：

- `apps/backtest` 在启动 TCP message acceptance 和 runner 前记录唯一 `startupCutoff`，先把遗留
  RUNNING 条件标记 FAILED，再只处理 `createdAt <= startupCutoff` 的旧 PENDING；
- PENDING 使用 `createdAt ASC, id ASC` 稳定排序，只选择前
  `BACKTEST_CONCURRENCY + BACKTEST_QUEUE_CAPACITY` 个不同 runId 纳入本地 admitted set；ready 后最早
  `BACKTEST_CONCURRENCY` 个进入 execution slot，其余进入 FIFO waiting queue。查询不得把全部
  PENDING 加载到内存；
- 同一 cutoff 下其余仍为 PENDING 的 run 使用条件更新标记 FAILED，并记录稳定失败类
  `BACKTEST_STARTUP_QUEUE_FULL`，不得留在 PENDING、重试或等待队列释放；
- 上述步骤完成前 health 必须表达 `backtest.ready=false`，TCP handler 不接受新 command，runner
  也不开始 claim/执行；完成后才设置 `backtest.ready=true` 并启动正常接收与执行；
- `apps/mist` 启动时同样固定自己的 cutoff，随后由隔离的 Backtest startup-compensation task 只调用
  `BACKTEST_HEALTH_URL` 一次。该 request 使用内部固定常量
  `BACKTEST_STARTUP_HEALTH_TIMEOUT_MS = 3000`，不进入 env/HTTP/RPC/strategy；不得先 sleep、轮询、
  retry 或等待 ready 状态变化；
- 仅当该唯一响应是 HTTP 200、符合 `BacktestHealthVo` 且 `status=ok,backtest.ready=true` 时，task 才
  对 cutoff 前仍为 PENDING 的 run 各补发一次 TCP message；每个 redispatch 继续使用既有
  `BACKTEST_COMMAND_TIMEOUT_MS`，补发失败则条件标记 FAILED；
- health unreachable、3 秒 timeout、非 200、非法 JSON/contract、`status!=ok` 或
  `backtest.ready=false` 都统一归类为 startup dependency unavailable。task 不补发 command，而以
  `status=PENDING AND created_at<=cutoff` 为前置条件做一次 set-based FAILED update，写稳定失败类
  `BACKTEST_STARTUP_UNAVAILABLE` 和完成时间；已经 RUNNING/COMPLETED/FAILED 的 run 不受影响；
- health 原始 body、URL query、exception 或 stack 不进入 run `errorMessage`。startup-compensation task
  boundary 记录一次带 sanitized outcome/cutoff 的权威日志和 metric。若上述 FAILED update 自身发生
  TypeORM/MySQL 错误，task 记录数据库错误后结束，不递归重试，也不让该隔离 task 的失败阻止
  `apps/mist` 其他公共 API、market ingress 或 live signal 启动；
- 已经在本地等待集合、正在 RUNNING 或已经 COMPLETED 的同一 runId，handler 必须返回幂等
  `ok=true` no-op，且不得再次占位或把 run 改回 PENDING；FAILED run 返回 `run_failed`，不得
  伪装为 accepted；
- 启动补偿完成后，新增 run 只走 TCP 正常路径，不设置定时 scanner。

`apps/backtest` 在遗留 RUNNING 清理、PENDING 查询、overflow 条件失败或入队前的任一启动数据库
操作发生非目标错误时，startup reconciliation 视为失败：`backtest.ready` 必须保持 `false`，
TCP handler 和 runner 不得启动，异常直接进入进程启动边界；应用内不新增数据库重试循环。

该补偿只覆盖未开始的 PENDING 交接，不重试 FAILED run，也不恢复已中断的 RUNNING run。
两个进程的 cutoff 可以不同；若 `apps/mist` 的一次检查发生在 Backtest reconciliation 期间，它可以
条件失败仍为 PENDING 的本地 admitted identity，Backtest 随后的 claim 将以 `affected=0` 安全释放
slot。幂等 accepted、runId dedupe 和所有状态更新的前置条件共同保证同时启动或独立重启时不会双跑，
也不会把 RUNNING/FAILED 覆盖回 PENDING。该简单边界有意接受启动竞态下旧 PENDING 被失败，不追求
等待后的自动恢复；用户需要时显式创建新 run。

### 7. V1 使用单实例和显式失败

V1 的 Windows appliance 只运行一个 `backtest` 实例，但该实例包含
`BACKTEST_CONCURRENCY` 个逻辑 execution slot。每个 slot 都通过带 `status=PENDING` 前置条件的原子
更新领取自己的 run；条件不成立即视为未领取并立即释放该 slot，不执行计算。

进程正常捕获的执行错误写入 FAILED。进程崩溃后，新的唯一实例在启动时把遗留 RUNNING run 标记为
FAILED，并记录“执行进程中断”类错误；它不得自动改回 PENDING、续跑或创建新的 run。用户重跑时
由 `apps/mist` 创建新的 run identity。

runner 在 claim、历史 K page、result persistence 或 completion persistence 遇到非目标数据库错误
时，必须立即停止当前 run，并在单个 run 的最外层只尝试一次短事务：

1. 使用 `WHERE id=? AND status IN (PENDING,RUNNING)` 条件把 run 更新为 FAILED，写入稳定失败类
   `BACKTEST_DATABASE_ERROR` 和完成时间；
2. 只有条件更新 `affected=1` 时，才在同一事务删除该 run 的部分 `BacktestSignalResult`；
3. `affected=0` 时不删除结果，避免 completion 已提交但 response 丢失时误删合法 COMPLETED 结果；
4. 该收口事务失败时，不递归重试；runner 同时记录原始错误和收口错误，后者不得覆盖前者，并隔离
   当前 run 后继续处理后续任务。

现有 `uq_backtest_signal_results_run_security_time` 继续保证同一
`(backtestRunId, securityCode, signalTime)` 最多存在一行。它不阻止重复回测：每次用户重跑都由
`apps/mist` 创建新的 `BacktestRun.id`，所以不同 run 可以持久化相同 security/time。

该唯一键冲突在 V1 不是正常幂等结果，也不建立专用 constraint classifier、pre-insert lookup、
readback、skip 或 retry。包括该索引在内的任何 result unique、FK、NULL、类型、连接、事务和 commit
错误都进入上述 non-target persistence failure 与部分结果清理路径。内部日志可以记录经过清理的
driver code 和 constraint name，但不得把冲突改写成成功。索引名称和列组保持现状，不新增或修改
migration。历史回放本身不得被放入一个长事务。

该方案不新增 lease、heartbeat 或 attempt 字段。未来若需要多实例或自动接管，必须新建或更新
OpenSpec，重新设计租约、部分结果和 migration。

#### 7.1 单一内部 health 区分存活与 Backtest readiness

`apps/backtest` 作为 Nest hybrid application 同时承载内部 HTTP health listener 和 TCP microservice
listener。它只增加 Docker 内网 `GET /health`，不经 web gateway/Nginx、不注册公共策略 route，也不
增加 `/live`、`/ready` 或 health RPC。响应使用显式 `BacktestHealthVo`，不返回字符串 hello，也不套
公共业务 `ApiResponseDto`：

```json
{
  "status": "ok",
  "service": "backtest",
  "backtest": {
    "ready": true,
    "state": "ready",
    "activeCount": 1,
    "waitingCount": 3,
    "concurrency": 2,
    "queueCapacity": 8
  }
}
```

listener 配置固定为：

- `apps/backtest` 的 `backtestEnvSchema`：`PORT` 使用 Nest app 既有命名，默认 `8004`；
  `BACKTEST_RPC_PORT` 默认 `8005`。两者都必须通过 `Joi.number().port()`，且显式相等时 startup
  validation fail-fast，不能在 bind error 后才发现冲突；
- `apps/mist` 的 `mistEnvSchema`：`BACKTEST_RPC_HOST` 是非空字符串，local default
  `127.0.0.1`；`BACKTEST_RPC_PORT` 通过 port validation 且默认 `8005`；`BACKTEST_HEALTH_URL` 通过
  absolute HTTP URL validation，local default `http://127.0.0.1:8004/health`；
- Compose 中 `backtest` server 使用 `PORT=8004`、`BACKTEST_RPC_PORT=8005`；`mist-backend` client 使用
  `BACKTEST_RPC_HOST=backtest`、`BACKTEST_RPC_PORT=8005`、
  `BACKTEST_HEALTH_URL=http://backtest:8004/health`；monitoring 同样探测
  `http://backtest:8004/health`；
- `8004/8005` 只在 Compose service network 内监听/暴露，不增加 host `ports:` mapping，不经 web
  gateway。应用源码不得再硬编码第二套 host、port 或 URL fallback；默认值只由 schema 产生。

HTTP 和 TCP 不能共享一个 socket，因此 V1 明确增加一个独立 RPC port，而不是把两个协议复用在
8004。`BACKTEST_RPC_PORT` 在 server/client 两侧使用同名契约；`BACKTEST_HEALTH_URL` 保留完整 URL，
避免 `apps/mist` 再拼接未校验的 HTTP host/port/path。

`status=ok` 只表示进程仍可响应 health contract；`backtest.ready` 有明确对象作用域，只表示该 runtime
能够接受 Backtest command。`backtest.state` 只允许 `starting|reconciling|ready|stopping`，用于解释
ready false 的原因，不增加 `failed` 常驻状态：初始化或 startup reconciliation 的数据库异常按既定
规则传播到启动边界并退出进程。

Nest/TypeORM 初始化失败时应用在 HTTP listener 可用前直接退出。HTTP health listener 建立后先响应
`ready=false,state=starting|reconciling`；只有 stale RUNNING cleanup、bounded PENDING reconciliation、
scheduler 初始化和 TCP listener acceptance 全部完成后，才能原子发布 `ready=true,state=ready`。队列
达到 capacity 时服务仍然 ready，特定 command 继续返回 `queue_full`；run 成败、waiting depth 或
active slot 是否占满不得改写 readiness。

health 只读取进程内状态和已校验配置，不为每次探针查询 MySQL、不列举 runId/securityCode，也不把
单个 run 的数据库失败变成容器重启信号。`activeCount/waitingCount/concurrency/queueCapacity` 必须是
非负、有界、低基数诊断；metrics 仍是趋势和告警的正式观测面。

停机只采用现有简单中断语义：收到 shutdown signal 后先发布
`ready=false,state=stopping`，停止接受新 TCP command，再关闭 listener/process；V1 不增加 drain
timeout、抢占、续跑或接管协议。被进程终止打断的 RUNNING run 继续由下一次启动按既定规则标记 FAILED。

Compose healthcheck 只要求 `/health` 返回 contract-valid HTTP 200，表示容器进程可观测；部署完成门禁
和部署完成门禁必须进一步读取 `backtest.ready=true`；`apps/mist` startup compensation 只做一次
3 秒有界读取并按结果成功补发或失败收口。`mist-backend` 不得以
`depends_on: condition: service_healthy` 或等价门禁把
Backtest 变成全局启动依赖；Backtest 不可用时其他公共 API、market ingress 和 live signal 仍启动。

### 8. 共享代码留在 libraries

公共 HTTP 和 RPC envelope 位于 `libs/transport/http|rpc`；Backtest pattern/command/error-code/decoder
位于 `libs/backtest`；strategy evaluator、validator、bounded context contract、Strategy-owned
Indicator calculations、`QuantityForwardFillProjector` 和 TypeORM entities 放在各自职责明确的
`libs/*`。ChanCore 可继续
服务现有 Chan API，但不进入 V1 strategy field catalog 或 backtest hot path。`apps/mist`、
`apps/backtest` 与 `apps/signal` 不得互相导入 application source。

#### 8.1 Backtest 使用统一 StrategyMarketDataPort 的 replay capability

前置 `evolve-strategy-evaluation-contract` 在共享 strategy domain library 单一持有
`StrategyMarketDataPort`、canonical `StrategyBar`、`StrategyReplayPageCriteria` 与
`StrategyReplayPage`。完整 port 同时声明 replay、realtime warmup 与 realtime observation，但本
change 不重新定义这些 types，也不实现 realtime methods。

`apps/backtest` 只装配 `readReplayPage()` 的 MySQL adapter，不连接 market Redis，不处理 realtime
trigger 或 snapshot。固定 `REPLAY_PAGE_SIZE=1000` 属于该 adapter 的内部实现约束，不进入公共 port
criteria、HTTP、RPC、environment、strategy 或 caller input。

这些类型不经过 Controller、OpenAPI 或 RPC envelope。HTTP query string 继续使用 `*QueryDto`，
内部只读条件使用 `*Criteria`，内部返回值按 `*Page` 的 domain responsibility 命名。

Backtest runner 先把 `targetUniverse` 解析为 canonical security identities，再以单一
`(securityId, source, period)` 调用 replay capability。reader 不接收 runId、strategy version、
rule、lookback、Indicator 配置或 TypeORM relation，也不返回 `K` entity。`StrategyBar` 只暴露
canonical identity、timestamp、OHLC、规范 decimal-string/null 量额和必填
`type: 'complete' | 'incomplete'`。MySQL historical replay 映射为 `type='complete'`；公共 contract
为 realtime derived K 保留 `incomplete`，但 backtest reader 不推断或合成 incomplete bar。

MySQL `k.open/high/low/close` 保持现有 `DECIMAL(20,2) NOT NULL`，本 change 不迁移精度。mysql2
materialize 的 fixed-scale OHLC string 只允许在 `readReplayPage()` persistence boundary 通过前置
change 单一持有的纯函数 `KPriceProjector` 转成 finite number，再写入
`StrategyBar`。reader 不启用全局 `decimalNumbers` 或 TypeORM transformer，不在 repository、runner、
Indicator、evaluator 或 Chan wrapper 中复制 `Number(...)`，也不舍入、回填或改写数据库。该价格视图
与下述量额 exact-decimal/unit mapper 是两条独立路径。

V1 的历史事实边界固定在 MySQL `k`：只要 TDX/QMT provider 返回的 bar 已通过现有 decoder/writer 并
持久化，该 row 就是 Backtest 的权威 historical bar。上游当前 `fillData/fill_data=true` 保持不变，
本 change 不尝试判断某行是否由 provider 补齐，也不新增 `providerFilled` provenance、quality/type、
gap detector、历史清理或重导逻辑。结果是：

- 同组不同 timestamp 即使 OHLCVA 完全相同，也分别作为合法 `type='complete'` bar 有序消费并计入
  `consumedBarCount`；它们不是 database identity duplicate；
- 只有 MySQL 中没有 row 的 timestamp 才属于 Backtest 视角的缺 K，reader 不为该 timestamp 自行造 bar；
- provider 返回的 non-null 重复量额属于 raw `observed`，不得被标记成 `forwardFilled`；只有 persisted
  raw quantity 明确为 null 时，才进入 `QuantityForwardFillProjector`；
- replay、Indicator 和 signal evaluation 接受该 provider-defined history，不做额外真实性校验。

该决定仅确认 Backtest 消费语义，不扩大本 change 去修改 TDX/QMT 采集链路。

canonical `StrategyBar` 的量额单位固定为 `volume=股`、`amount=人民币元`，不能把 MySQL `K` 的
source-specific 存量含义直接泄漏给 evaluator。`readReplayPage()` 的 persistence mapper 必须先保留
TypeORM `DECIMAL(36,8)` exact string，再按 `(source, SecurityType.STOCK, period family)` 的已验收
quantity profile 使用
candle foundation 的 Decimal8 做一次性规范化和精确整数单位缩放：

- TDX A 股 expected profile：volume 必须是非负 integral share string，作为股原值保留；amount 作为万元
  精确乘以 `10000` 后成为人民币元；
- QMT A 股 expected profile：volume 必须是非负 integral lot string，精确乘以 `100` 后成为股；amount
  保留 provider float 可观察值规范化后写入 MySQL 的 exact decimal string，按人民币元原值使用；
- 非零 fractional volume 不得四舍五入、截断或 `Number()` 转换，必须使引用 quantity 的该次执行
  fail closed；缩放后的值仍须满足 Decimal8/`DECIMAL(36,8)` 范围；
- TDX/QMT 的 1m 与日线必须分别用官方/fixture 证据及真实链路 HIL 证明 raw provider 字段、MySQL exact
  string 与上述 canonical mapping。证据未被项目负责人验收前，对应 `(source, STOCK, period family)`
  profile 不得标记 approved；
- profile 未证明时，价格/Indicator replay 可以继续，但引用 `k.volume/k.amount` 的 execution plan
  必须在 validation/registration 门禁 ineligible，不能把 raw DB value 当作股/元；
- EF 不属于 Backtest V1：reader 不实现 EF branch，公共 POST 不创建 EF run，worker 不执行存量 PENDING
  EF run；未来增加任何 source 必须通过 focused change 明确 source scope 与 quantity profile；
- V1 不新增 `volume_unit`/`amount_unit` 列，不修改或回填 MySQL `k`，也不把每条 bar 的固定单位重复
  写入 `StrategyBar`。单位由 canonical field contract 表达，source 继续保留 provenance。

固定 scale MySQL 文本先在 persistence boundary 规范化，再执行 source profile 换算；任何输入或缩放
结果越过 `DECIMAL(36,8)`、需要舍入或不符合非负量额语义时 fail closed。该 mapper 不经过 JavaScript
`number`，也不实现第二套 decimal primitive。

raw `StrategyBar` 完成 mapping 后不得改写其 null。runner 在构建 evaluation context 前复用共享纯函数
`QuantityForwardFillProjector`，按 `(securityId, source, period, tradingDay)` 保存 volume/amount 各自
最近的 non-null effective value；显式 `"0"` 是有效观察。当前 null 只可使用同交易日更早的值，
不得读取 future、不得跨日，也不得写回 MySQL 或 raw replay page。

matched evaluation 写入 `BacktestSignalResult.contextSnapshot` 时必须调用共享 strategy library 的同一
serializer，不能在 Backtest app 中重建 shape。`k.volume/k.amount` 保存 evaluator 实际使用的 canonical
scalar；compiled plan 需要的量额 observation 以 `quantityEvidence.current` 记录，crossover 等需要
prior observation 时再增加同形 `quantityEvidence.previous`。每项固定保存 raw canonical string/null、
non-null effective canonical string 和 `observed|forwardFilled` resolution。plan 不消费量额时省略整个
evidence；evidence 集合在 boolean 短路前按 plan materialize。projector 仍 unavailable 时不生成
BacktestSignalResult 或 contextSnapshot。该 JSON shape 复用既有列，不复制完整 raw K，也不要求
数据库 migration。

用户请求的 `startAt/endAt` 仍是结果发布边界。若 intraday 回测从交易日中途开始且 execution plan
消费 quantity，runner 可把内部 `StrategyReplayPageCriteria.startAt` 扩到该交易日 session 起点并按序
重放 projector seed，但 `startAt` 以前的 bar 只用于 missing-value preparation，不生成本次 run 的
`BacktestSignalResult`。该 preparation 不改变 field catalog 的 `calculationBarCount=1`，也不变成用户
lookback。日线 bar 的 tradingDay 每根都不同，因此日线 null 不继承上一交易日；停牌日不存在 K 时
不补 K、不创建 evaluation anchor。

在固定 security/source/period 下，现有
`uq_k_security_source_period_timestamp(security_id, source, period, timestamp)` 保证 timestamp
唯一，因此内部 cursor 使用 `afterTimestamp`，按 `timestamp ASC` 做 keyset page，不增加 `id`
tie-breaker。内部固定代码常量 `REPLAY_PAGE_SIZE=1000`；第一页使用 inclusive `startAt/endAt`，后续页
额外使用严格 `timestamp > afterTimestamp`，每次最多返回 1000 根，返回少于 1000 根时结束。不得使用
OFFSET，不得把 page size 暴露为 HTTP/RPC input、env/config、strategy lookback 或 per-run hard limit。

reader 只选择构造 canonical `StrategyBar` 所需的 K 列；security identity 已由当前 group criteria
固定，不为每页加载 `security` relation 或 extension entity graph。runner 必须消费完当前页再读取
下一页，但 bounded context、Indicator rolling window、quantity projector、crossover prior observation
和结果计数都跨页保持连续，不能把 page boundary 当成数据或交易日边界。任一分页查询失败按后端
错误治理传播到 Backtest task boundary，不 fallback、retry 或返回部分成功。1000 只限定单次数据库
响应和临时对象数量。

TypeORM/query-builder 生成的物理查询形状固定为：`security_id/source/period` 等值条件、
`timestamp >= startAt AND timestamp <= endAt`；只有后续页再增加严格
`timestamp > afterTimestamp`，随后 `ORDER BY timestamp ASC LIMIT 1000`。projection 只包含
`timestamp/open/high/low/close/volume/amount` 等构造 `StrategyBar` 所需列；不能 join `securities`、加载
extension、使用 OFFSET、执行预先 `COUNT(*)` 或通过 `FORCE INDEX` 掩盖 optimizer/schema 问题。

现有 `uq_k_security_source_period_timestamp(security_id,source,period,timestamp)` 的 equality-prefix +
timestamp range/order 与该查询完全对齐，因此 V1 不新增 K index、entity index metadata 或 migration。
实现/发布门禁必须在真实 MySQL 8.4 和代表性现有数据上保存：

- `SHOW INDEX FROM k`，确认索引名称、四列顺序、unique 和当前物理列 `security_id`；
- 一个高密度 1m group 和一个日线 group；
- 每种至少验证 first page 与带真实中间 cursor 的 middle page；
- 对每条代表性查询保存 `EXPLAIN FORMAT=JSON` 与 `EXPLAIN ANALYZE`，证明 optimizer 选择上述 unique
  index，没有 full table scan 或 filesort，并记录 estimate/actual rows、loops 和执行时间。

V1 不在没有真实证据时硬编码 latency 或 estimate-ratio 阈值。门禁关注索引路径、排序方式、bounded
page 和实际数据表现；若任何代表性 query 未选择该索引或出现 full scan/filesort，则 replay 实现/发布
必须停止，先检查真实 schema、参数类型、统计信息和 query shape，再以单独评审决定是否需要新的
forward-only migration，不能直接猜测新索引或加入 `FORCE INDEX`。

V1 的 snapshot consistency 由运行前提而不是 runtime 机制提供：一个 Backtest 读取所选
`(securityId,source,period,startAt,endAt)` historical K 期间，不会有 MySQL historical writer 对该输入
范围执行 insert/update/delete。reader 因此使用普通有界 TypeORM/MySQL page query，不开启覆盖整轮
replay 的 `REPEATABLE READ` 长事务、不加行/表锁、不做运行前后 `COUNT/MAX(updated_at)` 指纹、不复制
K 到内存快照/staging table，也不增加 data revision、错误码、retry 或 migration。实时 snapshot/candle
继续写 Redis，不是 MySQL historical K mutation，不影响该前提。

该前提是部署与使用约束，不伪装成代码已强制的 guarantee。若未来 history sync、人工采集或其他 writer
需要与 Backtest 并行，必须另建 focused change 选择 MVCC snapshot、versioned dataset 或显式 mutation
detection；V1 在此前不为违反前提的并发写入承诺 coherent snapshot。整轮 cooperative deadline 与
实际消费 K 总数 hard limit 已按本 design 第 5 节固定；replay query plan 按上述真实 MySQL 门禁验收。

### 9. Backtest 与 live persistence 分开

`apps/backtest` 只能推进已确认的 backtest state 并写入 backtest result。live
`StrategySignal`/PENDING `StrategyAlertEvent` 仍由 `apps/signal` 唯一写入；回测结果不得通过
`signalSource=backtest` 混写 live 表来替代 `BacktestSignalResult`。
两种持久化目标虽然分表，但必须消费 `evolve-strategy-evaluation-contract` 持有的同一
contextSnapshot serializer，以共同 fixtures 验证结构与 evaluation evidence parity。

### 10. 本次迁移不扩大产品语义

迁移前后保持 signal-level replay：相同 immutable strategy version、target universe、period、
source、time range 和有序 historical K，在相同算法版本下产生相同结果。portfolio execution
需要未来独立 change，不以“预留字段”为由修改当前 schema。

### 11. 与 realtime change 共享前置但不互相阻塞

`extract-backtest-runtime` 与 `run-realtime-strategy-evaluation` 都依赖
`standardize-service-boundary-contracts` 和 `evolve-strategy-evaluation-contract`。realtime change
还依赖 current-day candle。`extract-chan-core` 不阻塞这两个 Strategy runtime。两个 runtime
change 在共同 transport/domain/evaluation contract 稳定后可独立推进，不互相导入 app 源码，也不
共享未隔离的工作队列。

## Risks / Trade-offs

- [现有同步 POST 契约与异步 worker 冲突] → POST 固定为
  `202 + BacktestRunReceiptVo{runId,initialStatus=PENDING} + Location`，明确 `initialStatus` 只是创建
  初态；当前进度和结果只从 GET 资源读取。
- [GET 直接返回 entity 导致 persistence 与 OpenAPI 漂移] → 使用
  `BacktestRunIdParamDto → BacktestRunVo → ApiResponseDto<BacktestRunVo>`，保持现有 JSON 字段
  但不暴露 TypeORM entity。
- [调用方继续把异步 POST 当作完整 run] → accepted data 与 run VO 使用两个类型；后端/OpenAPI
  contract tests 证明 POST `runId` 可跟随 Location 查询当前资源，实际前端改造放入独立 change。
- [部分目标被跳过却只显示成功或失败] → 以持久化 `targetIssues` 表达两类可识别业务缺口；至少一个
  目标可执行即可 COMPLETED，全部跳过使用 `BACKTEST_NO_EXECUTABLE_TARGETS`，不新增 PARTIAL。
- [把系统错误吞成 target warning 后继续运行] → issue code 只允许
  `SECURITY_NOT_FOUND|NO_HISTORICAL_BARS`；数据库、K/计算和持久化错误仍 fail whole run。
- [为了提醒用户又造一条通知链路] → run GET 终态资源携带 `targetIssues`，V1 继续由调用方轮询，
  不增加 WS/SSE/WeCom/AstrBot/AlertEvent；前端展示由独立 change 持有。
- [失败 run 泄漏原始持久化 message] → `BacktestRunVo` 只放行稳定安全失败类，未知历史值使用
  `BACKTEST_EXECUTION_FAILED`，原始异常只进入受控日志。
- [tasks 中的泛化 cancel 用例诱导实现未设计的能力] → V1 明确没有 cancel route/RPC/status/field；
  negative contract tests 只证明取消能力不存在，deadline 与中断继续使用 FAILED。
- [API 与 worker 分别写同一 run] → `apps/mist` 只创建 PENDING 记录，`apps/backtest` 独占领取后的
  状态转换；用精确条件更新和测试阻止越权写入。
- [两个不同 correlation 的同 run command 同时观察 PENDING 并重复占位] → keyed admission chain
  串行同一 run，dedupe-before-capacity，capacity/reservation 无 await，逐请求重建 correlation result。
- [response loss 后 API 已标 FAILED，但 memory queue 仍准备执行] → runner 只以 PENDING 条件 claim；
  affected=0 丢弃 identity 且 finally 释放 slot，不 readback、不恢复 PENDING。
- [一次加载全部 K 导致内存或数据库压力] → 设计 bounded cursor/page、deadline、concurrency 和
  per-run limits，不把当前全量读取原样搬进新进程。
- [分页期间历史输入发生变化] → V1 明确以所选 MySQL historical K 在 Backtest 读取期间无并发 writer
  为运行前提；不用长事务、锁、指纹或副本增加复杂度。未来允许并行写入前必须单独设计 snapshot。
- [worker 分批写入被误当作最终结果] → `COMPLETED` 是唯一发布门；PENDING/RUNNING/FAILED 的
  signals GET 返回 `200 + success=false +` 稳定业务码，不用成功 `200 []` 混淆尚未完成与最终
  零匹配。
- [“有界 batch”没有数值仍可能缓存整轮结果] → 固定内部
  `BACKTEST_RESULT_BATCH_SIZE=100`，每个 run 独立 buffer，满批和最终 remainder 使用短 multi-row
  insert；失败不 fallback/retry/skip，交由既有 cleanup。
- [worker 失败留下部分结果] → 所有 runner-owned 失败和 stale RUNNING cleanup 都以一次短事务
  条件标记 FAILED，并仅在状态转换成功时删除部分结果；cleanup 失败不递归重试，公共状态门继续
  阻止部分行泄漏。
- [把结果唯一键误解为禁止重复回测] → 唯一键包含 `backtest_run_id`；每次显式重跑创建新 run，
  不同 run 可以产生相同 security/time。同一 run 内冲突按持久化失败处理，不静默跳过重复结果。
- [MySQL commit 与 TCP send 之间进程崩溃] → 两端启动时各执行一次 bounded PENDING 补偿，不运行
  周期 scanner。
- [TCP response 丢失时 API 误判失败] → FAILED 更新必须带 PENDING 条件；已 RUNNING 的 run 不受影响。
- [已创建 run 的提交失败缺少可追踪 identity] → `429/503` body 与 `Location` 都返回 run identity；
  失败 run 保留审计，显式重提创建新 run。
- [本地队列容量配置校验失败] → 缺失值由 `backtestEnvSchema` 解析为 `8`；非整数、小于 `1` 或
  大于 `64` 的显式值在应用启动阶段 fail-fast，不由业务代码 fallback。
- [TCP command 无界等待或多套 timeout 冲突] → `mistEnvSchema` 只提供一个端到端
  `BACKTEST_COMMAND_TIMEOUT_MS`，默认 `3000ms`、范围 `500–30000ms`，覆盖连接和响应且不自动重发。
- [Backtest 自行发明内部 envelope] → 复用 `RpcRequestV1/RpcResultV1`，只在 `libs/backtest`
  定义 `backtest.run.submit.v1` pattern/command/error code/decoder。
- [HTTP 与 RPC 无法关联] → HTTP server requestId 作为必填 correlationId 发送并由 handler 原样
  echo；runId 继续单独承担幂等 identity。
- [远端数据库错误泄漏或被错分成业务拒绝] → shared RPC exception filter 只发送
  `RPC_INTERNAL_ERROR`；apps/mist 返回内部 `500`，不得映射为 `queue_full/not_ready/run_failed`
  或连接不可用。
- [已创建 run 的数据库失败丢失资源 identity] → 已知 runId 时 `500` 保留 `{runId}` 和
  `Location`，但状态未确认时不返回或猜测 `status`。
- [completion commit 响应丢失后清理误删合法结果] → runner 先条件转换 PENDING/RUNNING 为
  FAILED，只在 `affected=1` 时于同一短事务删除部分结果。
- [启动时遗留 PENDING 过多] → 在 runner 和 TCP acceptance 前按稳定顺序仅恢复
  `BACKTEST_CONCURRENCY + BACKTEST_QUEUE_CAPACITY` 个 run，并将同一 cutoff 下其余 PENDING 条件标记
  `BACKTEST_STARTUP_QUEUE_FULL`；不全量加载、不静默遗漏。
- [并发 run 争用 CPU/MySQL/heap] → 单实例 concurrency 由 `BACKTEST_CONCURRENCY` 固定默认 2、范围
  1–8；active/waiting 分开计量，每 100 根实际消费 K 或 page end 用 `setImmediate` 让出调度机会，并
  以 pool/heap/event-loop HIL 限制生产值。
- [为独立 service 猜测 CPU/内存配额导致错误限流或 OOM] → V1 不配置 Compose CPU/内存 hard limit 或
  reservation；沿用已确认的逻辑容量边界并记录 HIL，后续只有独立证据和 change 才能增加容器配额。
- [计算 batch 与结果 batch 同为 100 后被错误合并] → 分别保留
  `BACKTEST_CALCULATION_BATCH_SIZE` 和 `BACKTEST_RESULT_BATCH_SIZE`；前者控制 event-loop yield，后者
  控制待写 JSON buffer，测试禁止通用 `BATCH_SIZE`。
- [一个 run 长期占用 execution slot] → 每个 RUNNING run 使用独立
  `BACKTEST_RUN_TIMEOUT_MS`，默认 30 分钟、范围 1 分钟至 24 小时；只在安全边界协作检查，超时进入
  `BACKTEST_EXECUTION_TIMEOUT` cleanup 并释放该 slot，不影响其他 active run。
- [用 Promise.race 伪装已经取消数据库查询] → run deadline 不声称抢占同步代码或取消 in-flight
  driver operation；控制权返回后再观察 deadline，真实 query timeout 由数据库边界独立治理。
- [一个 run 通过超长区间持续消耗数据库和 CPU] → 只设置跨全部 replay group 的实际消费 K 总数上限；
  `BACKTEST_MAX_BARS_PER_RUN` 默认 1000 万、范围 1 万至 5000 万，seed 同样计数，第 limit+1 根触发
  `BACKTEST_BAR_LIMIT_EXCEEDED` cleanup，不另建日期/证券/result 上限矩阵或预先 `COUNT(*)`。
- [两个表的 DDL 放在同一 migration 文件后部分成功] → `target_issues` 与 pagination index 使用两个
  单 DDL 文件，由现有 runner 分别登记；不为本 change 引入动态幂等 SQL 或改造 migration runner。
- [两端同时启动时 apps/mist 无界等待 readiness] → startup compensation 只做一次 3 秒 health
  检查；ready 才补发，否则以 `BACKTEST_STARTUP_UNAVAILABLE` 条件失败旧 PENDING。Backtest 已经 claim
  的 run 不受影响，尚未 claim 的本地 identity 后续以 `affected=0` 释放。
- [把进程存活误作 Backtest command ready] → 单一内部 `/health` 同时返回 root `status` 和有对象作用域
  的 `backtest.ready/state`；Compose liveness 与部署/补偿 readiness 检查分别消费对应字段。
- [队列满导致 health flap 或容器重启] → capacity rejection 继续使用 `queue_full`；active/waiting 满不
  改写 ready，health 不实时查询 MySQL 或跟随单 run 成败。
- [hybrid app 把 HTTP 与 TCP 绑定到同一端口] → `PORT=8004` 与
  `BACKTEST_RPC_PORT=8005` 独立校验，显式相等时启动失败；server/client 复用 RPC port 名，health
  consumer 使用完整 `BACKTEST_HEALTH_URL`。
- [内部端口被误当成公共入口] → Compose 不发布 8004/8005 到 host，web gateway 不配置 route；部署和
  monitoring 只通过 service network 访问。
- [把 backtest readiness 误作 backend 全局依赖] → compensation 是隔离的一次性 task，不等待 ready
  变化；`mist-backend` 的进程存活、其他 API、market ingress 和 live signal 不以该结果为前置条件。
- [独立 service 增加运维面] → 同步设计 health、metrics、diagnostics、start order 和 rollback。

## Migration Plan

1. 记录当前 API、schema、存量 run/result、执行行为、部署和测试基线。
2. 先验收 `standardize-service-boundary-contracts` 的 shared HTTP/RPC envelope 和 correlation。
3. signals pagination 与 `backtest_runs.target_issues` 已确认；完成 schema/index inventory 后固定
   forward-only migration 编号与生产门禁。run query、无用户取消、partial-result visibility、
   result unique conflict、逐目标 warning 和非目标数据库错误按本 design 已确认边界实现。
4. 先完成 evaluator/context/analysis library extraction，并用共同 fixture 证明行为一致。
5. 新增未接流量的 `apps/backtest`，验证内部 `/health` 的 liveness/readiness 分层、build、database
   access 和资源上限。
6. 实现确认后的 command/execution/persistence 边界和 crash/restart tests。
7. 完成 Windows appliance、monitoring、真实 MySQL 和负载验证后再切换公共 API。
8. 先部署并验证未接流量的 `backtest`，再部署只通过 RPC 提交的 `mist-backend`；同步 executor 随
   backend cutover 删除，不增加 feature flag、双跑、本地 fallback 或专用 rollback contract。

## Open Questions

- historical K 已确认按单一 security/source/period 使用 timestamp keyset page，固定内部页大小 1000；
  snapshot consistency 已确认为“读取期间 historical K 无并发 writer”的 V1 运行前提；执行 deadline
  与 per-run 实际消费 K 总数上限已确认；replay query shape、现有 K unique-index 复用和代表性真实
  MySQL 证据门禁已确认。
- Backtest V1 source scope 已确认只含 TDX/QMT；EF 不接入、不修复、不迁移。TDX/QMT expected quantity
  mapping 已确认，剩余门禁是 1m/日线 raw provider → MySQL → canonical 的真实 fixture/HIL 证据。
- 单来源边界已确认：每个 run 只使用一个 source；TDX `front` 与 QMT `front_ratio` 无需等价，engine
  不做跨 source normalization、merge 或 fallback，不新增 adjustment-mode schema。
- provider fill 语义已确认：已持久化的 TDX/QMT historical row 一律作为权威 complete bar；不识别
  provider-filled provenance，不清理相同值的不同 timestamp row，也不修改上游 fill 参数。
- run 内股票调度已确认不是业务契约：V1 逐 group 串行，`BACKTEST_CONCURRENCY` 只限制 active run，
  不增加股票级并发配置；group 遍历先后可变但状态必须隔离。
- 逐目标业务缺口已确认通过 `targetIssues` 轮询可见：部分跳过仍 COMPLETED、全部跳过 FAILED、系统
  错误不降级；实际 `mist-fe` 提醒由独立前端 change 持有。
- `backtest_runs.target_issues` 与 `idx_backtest_signal_results_run_time_id` 的实际 migration 编号、生产
  schema/index inventory、representative `EXPLAIN` 和应用窗口；仓库顺序只将 `014/015` 识别为两个
  独立单 DDL 候选，不能关闭该门禁。
- `backtest` health/shutdown 已确认使用单一内部 `/health` 和简单中断语义；result persistence batch
  和 calculation batch 已分别固定为内部 100 条/根；V1 不新增容器 CPU/内存配额或发布阈值。
- cutover 已确认使用 `BacktestRunCommandService` 与 `BacktestRunQueryService` 分离控制面职责，先部署
  ready 的 Backtest service、后部署新 backend，并同步删除旧 executor；不双跑、不本地 fallback。
