## 1. 基线与影响链

- [ ] 1.1 记录 `mist`、`mist-fe`、`mist-skills` branch、HEAD、dirty/worktree 和 active changes。
- [ ] 1.2 建立 controller → interceptor/filter → HTTP wire → frontend/skills 与
  HTTP request → RPC sender → handler → result → HTTP adapter 影响链。
- [ ] 1.3 记录现有成功 200/201、expected business rejection、validation error、structured
  HttpException、unknown exception、requestId 和 Chan app contract tests。
- [ ] 1.4 审计 OpenAPI DTO、frontend unwrap、skills MistClient 对 `success/statusCode/message` 的真实
  依赖，以及新增必填 `code` 和 HTTP-200 business rejection 的迁移影响。

## 2. Shared Transport Library

- [ ] 2.1 创建 Nest library `transport`、`libs/transport`、`tsconfig.lib.json` 和 Nest CLI project；
  精确导出 `@app/transport/http` 与 `@app/transport/rpc`，不得增加根 alias、wildcard alias、相对路径
  或 deep import 绕过 subpath barrel。
- [ ] 2.2 实现 `http/index.ts` 与 `rpc/index.ts` 的分层 public API，并迁移
  `ApiResponseDto`/`ApiErrorDto`；删除重复 interface/DTO 字段定义并保留 Swagger metadata。
- [ ] 2.3 迁移 response interceptor、exception filter、response-message/OpenAPI decorator、request
  context、bootstrap installer、validation factory 和 transport modules；`HttpTransportModule` 通过
  `APP_PIPE/APP_INTERCEPTOR/APP_FILTER` 安装全局 HTTP provider，但不得通过 `MiddlewareConsumer`
  延迟安装 request context。禁止 transport library 依赖 config、constants、shared-data、strategy、
  market、TypeORM、Redis 或 provider code。
- [ ] 2.4 将 `apps/mist` 与 `apps/chan` 切换到 shared HTTP implementation，删除 `apps/chan` 对
  `apps/mist` 旧 HTTP interceptor、filter 和 response contract 的 application source import；
  两个 bootstrap 均须在 `NestFactory.create()` 后、所有 body parser/application middleware 前调用
  一次 `installHttpRequestContext(app)`，并删除手工 global pipe/interceptor/filter 及 controller 级
  `@UseFilters(AllExceptionsFilter)`；不处理由 `extract-market-analysis-kernels` owning change 负责的
  Chan 业务模块 import。

## 3. HTTP Contract 修复

- [ ] 3.1 使用真实 HTTP response status 填充成功 envelope `statusCode`，覆盖 200/201/202、
  `undefined -> data:null` 和 204 无 body behavior，且不保留 body-200 compatibility branch。
- [ ] 3.2 实现 `@HttpResponseMessage()`，默认 `SUCCESS`，并证明业务 `data.message` 不会被自动提升。
- [ ] 3.3 实现 `ApiErrorDto<TCode,TData>` 的必填 stable `code` 与可选 typed `data`；`code` 用于机器
  分支、`message` 用于安全可读信息。实现 status-to-default-code、结构化
  `code/message/data/errors` allowlist、仅 validation 输出 `errors`、5xx raw message fail-closed 和
  非错误 status exception 归一到 500；禁止 transport 导入 TypeORM/constants 或公开
  `DATABASE_QUERY_FAILED`。
- [ ] 3.3.1 对 public HTTP code 实施 `^[A-Z][A-Z0-9_]{0,63}$` runtime validation；覆盖空值、数字、
  lowercase、空格/连字符、非法 business marker、4xx fallback、5xx message/data fail-closed，并证明
  不执行 String/uppercase compatibility。明确 domain condition 使用领域 code（例如
  `BACKTEST_QUEUE_FULL`），transport default 仅作为无更具体语义的兜底。
- [ ] 3.4 实现 generic `HttpBusinessRejection<TCode,TData>` class 与 `instanceof` interceptor
  mapping：只有 adapter 明确分类的本地 application outcome 或 RPC expected business rejection
  才使用真实 HTTP 200 和 `success=false/statusCode=200/code/message/data`；capacity、availability、
  deadline 和 dependency failure 保持明确 4xx/5xx。不得按普通对象 shape 猜测、在 body 伪造
  404/409、在 shared transport 建立 RPC-code-to-HTTP 表或放入 domain enum。
- [ ] 3.5 在 HTTP 入口生成单一服务器侧 `requestId`，成功、失败和日志复用；拒绝未经验证的客户端
  request-id 覆盖；覆盖 malformed JSON 早期失败、fallback identity、`X-Request-Id` header 和
  request-context installer 仅注册一次；使用 `http-${randomUUID()}` 与 ALS.run，不使用全局 mutable
  id，不承诺自动改写所有现有 logger。
- [ ] 3.6 更新 Swagger/OpenAPI、interceptor/filter/integration tests 和 Chan HTTP contract tests；
  覆盖 business 200、validation 400、dependency 502/503、deadline 504、unknown 500 及
  statusCode/code/message 分层；覆盖普通与结构化 4xx、普通与 approved structured 5xx、未知
  `QueryFailedError`/普通 Error/非法抛出值、无 stack/SQL/driver/constraint 泄漏、response-time UTC
  timestamp 和不含 query string 的 path。
- [ ] 3.7 让 HTTP filter 成为同步请求最终 authoritative log owner：4xx/429 warning 无 stack，
  5xx error 保留 requestId 与原始 exception/cause；清理本次迁移 HTTP call chain 中明确的
  `logger.error + rethrow`，验证 representative request 只产生一条 authoritative log，并保留后台
  task/worker/realtime/startup/HIL 自己的最外层日志。
- [ ] 3.8 实现 recursive validation-error flattening，以稳定 dotted path（含数组下标）合并父子
  constraints；保留 whitelist/forbidNonWhitelisted/transform，禁用 implicit conversion，允许 DTO
  显式 `@Type/@Transform`，并证明 target/value/children/raw input 不进入 wire。DTO validation 使用
  `VALIDATION_ERROR` 和字段 errors，malformed JSON、普通 BadRequestException 与 Parse* pipe 使用
  `BAD_REQUEST` 且省略 errors。
- [ ] 3.9 实现 `ApiEnvelopeResponse` 与 `ApiTechnicalErrorResponse`：使用 allOf 引用 domain data，
  同一 status 的 success/business 或多个 technical variants 使用 oneOf；迁移现有 24 个 response
  decorators，但不补写所有未注解 legacy endpoint 或把 entity/VO 放进 transport。生成 OpenAPI JSON
  测试须覆盖 200 oneOf、201 envelope、400 variants、204 无 content 和正确 data schema reference。

## 4. RPC Contract

- [ ] 4.1 实现 `RpcRequestV1<TData>` 与
  `RpcResultV1<TData,TErrorCode,TErrorData=never>`，请求/响应都要求同一非空
  `meta.correlationId`，expected rejection 的 typed `error.data` 不得退化为 arbitrary details。
- [ ] 4.2 实现 strict contract tests：缺失/空 correlation、both/neither result branch、未知字段、
  非法 error code/data、correlation regex/echo、success/rejection 字段落错 branch；shared decoder
  只校验 envelope，domain decoder 校验 command/success/error data，malformed raw wire 不进入公共
  响应或日志。
- [ ] 4.2.1 覆盖 HTTP 并行 RPC 复用 request correlation、result mismatch fail-closed、error channel
  使用 caller 已知 correlation、非法 raw correlation 不进入日志，以及非 HTTP producer 为每个逻辑
  command attempt 生成独立 `rpc-${randomUUID()}`；不得新增 span、持久化或幂等语义。
- [ ] 4.3 固定 `domain.resource.action.vN` 命名及 consumer-first 升级规则；V1 payload 不重复
  `contractVersion`。验证 owning changes 将 Backtest 与 Signal control-plane pattern/type/decoder
  分别放入 `libs/backtest`、`libs/signal`，共享 evaluation contract 才进入 `libs/strategy`；不得建立
  全局 contracts/protocol library、在 transport 放业务 contract 或从任一 app source 共享。覆盖字段、
  union、error code/data 和语义变化必须升级；验证 handler-first V1/V2 并存、V1 拒绝 V2 字段、pattern
  唯一且 caller 不做 version fallback。
- [ ] 4.4 证明 HTTP-only 字段、业务 payload/error code、idempotency、retry 和 arbitrary details
  未进入 shared RPC envelope。
- [ ] 4.5 添加与 Nest common/core 对齐的 `@nestjs/microservices@10.4.15`，实现
  `RpcTransportModule`、`@RpcContract(domainDecoder)`、shared pipe/filter 和固定
  `{status:error,message:RPC_INVALID_REQUEST|RPC_INTERNAL_ERROR}` error-channel contract；filter 返回
  Observable，模块不得注册 global APP_FILTER，hybrid app 使用 `inheritAppConfig:false`。覆盖非法
  request/domain data、数据库/未知异常、完整内部日志、调用方 error channel、无
  stack/SQL/driver/constraint 泄漏，以及不得伪造 domain `ok=false` code。
- [ ] 4.6 添加精确 `@app/backtest`、`@app/signal`、`@app/strategy` root-barrel boundary tests：禁止
  wildcard/deep imports、transport→domain、strategy→backtest/signal、domain contract→
  transport/Nest/HTTP/Swagger/TypeORM/Redis、app-to-app source imports 和 caller/handler raw pattern
  duplication；application adapter 负责组合 domain contract 与 `RpcRequestV1/RpcResultV1`。

## 5. 兼容审计与验收

- [ ] 5.1 只读审计 `mist-fe`、`mist-skills` 对现有 endpoint 的兼容性并记录风险；不得修改 consumer
  代码或 tests，严格解析迁移由 `harden-http-envelope-consumers` owning change 交付。
- [ ] 5.2 运行 `mist` lint/typecheck/test/contract/build 完整基线；本 change 不执行或声称
  frontend/skills 修改基线。
- [ ] 5.3 执行本 change、相关 active changes 与 stable specs strict validation 和
  `git diff --check`。
- [ ] 5.4 全仓检索旧 response interface/DTO、body `statusCode: 200`、重复 requestId generator、
  `apps/chan -> apps/mist` 旧 HTTP transport import 和未分层 RPC envelope；不得把仍由
  `extract-market-analysis-kernels` 负责的 Chan 业务模块 import 误报成本 change 未完成。
- [ ] 5.5 记录自动化通过、环境阻塞和未执行项；本 change 不需要交易终端 HIL。
