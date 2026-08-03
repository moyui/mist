## Context

`apps/mist/src/interfaces/response.interface.ts` 与 `apps/mist/src/dto/api-response.dto.ts` 重复描述
HTTP envelope。`TransformInterceptor` 在所有成功响应中写入 body `statusCode=200` 和
`message=SUCCESS`，即使真实 HTTP status 是 `201` 或未来的 `202`；`AllExceptionsFilter` 对
`HttpException` 只提取 `message/errors`，无法返回已创建失败资源的 typed `data`。成功和失败路径
分别生成 `http-*` 与 `err-*` request id，不能形成跨进程 correlation。

`apps/chan` 当前从 `apps/mist/src` 导入相同 interceptor/filter，违反 application 不互相导入源码的
新架构边界。即将新增的 `apps/backtest` 与 `apps/signal` 又都需要统一 NestJS RPC contract，因此
应先建立 transport-owned shared library。

## Goals / Non-Goals

**Goals:**

- 用一个 `libs/transport` 同时承载公共 HTTP 与内部 RPC 的跨边界通用定义。
- 修复真实 HTTP status、显式 success message、typed error data 和 request/correlation identity。
- 消除 HTTP contract 双份定义和 `apps/chan -> apps/mist` 的 HTTP transport source import。
- 为后续所有 NestJS request-response 微服务提供同一 V1 RPC envelope 和命名规则。

**Non-Goals:**

- 不定义 Backtest、Signal、notification 或 provider 业务 payload/error code。
- 不把 HTTP status、message 或 OpenAPI 字段放入 RPC envelope。
- 不定义 `EventPattern()` 单向事件 envelope；未来需要时使用独立 `events/` 设计。
- 不新增数据库字段、兼容双写、service、queue、retry 或部署拓扑。

## Decisions

### 1. `libs/transport` 是唯一服务边界 owner

目录固定为：

```text
libs/transport/
├── src/
│   ├── index.ts
│   ├── http/
│   │   ├── index.ts
│   │   ├── api-response.dto.ts
│   │   ├── api-error.dto.ts
│   │   ├── http-business-rejection.ts
│   │   ├── http-request-context.service.ts
│   │   ├── http-request-context.middleware.ts
│   │   ├── http-validation-error.factory.ts
│   │   ├── http-response-message.decorator.ts
│   │   ├── api-envelope-response.decorator.ts
│   │   ├── http-response.interceptor.ts
│   │   ├── http-exception.filter.ts
│   │   └── http-transport.module.ts
│   └── rpc/
│       ├── index.ts
│       ├── rpc-request-v1.interface.ts
│       ├── rpc-result-v1.type.ts
│       ├── rpc-transport-error-v1.type.ts
│       ├── rpc-contract.decoder.ts
│       ├── rpc-validation.pipe.ts
│       ├── rpc-contract.decorator.ts
│       ├── rpc-exception.filter.ts
│       └── rpc-transport.module.ts
└── tsconfig.lib.json
```

HTTP consumer 使用 `@app/transport/http`，内部 request-response consumer 使用
`@app/transport/rpc`。两个 alias 必须分别精确指向各自 `index.ts`；不提供 `@app/transport` 根 alias
或 `@app/transport/*` wildcard，application 也不得使用相对路径或 deep import 绕过 subpath barrel。
根 `src/index.ts` 仅作为 Nest library 构建入口。

`transport` 可以依赖 Nest common/core/swagger/microservices、RxJS 与 Node 标准库，但不得依赖
`config`、`constants`、`shared-data`、strategy、market、TypeORM、Redis 或 provider adapter。
`http/index.ts` 不得导出 RPC primitive，`rpc/index.ts` 也不得导出 HTTP primitive。

`HttpTransportModule` 作为 global module 提供 `APP_PIPE`、`APP_INTERCEPTOR`、`APP_FILTER`、
`HttpRequestContextService` 和 request-context middleware，但不通过 `MiddlewareConsumer` 注册该
middleware。Nest 10 在 module middleware 之前注册内置 body parser；若在 module 内自动安装，非法
JSON 会在 request context 创建前失败。因此 `http-request-context.middleware.ts` 同时导出
`installHttpRequestContext(app)`，每个 HTTP bootstrap 必须在 `NestFactory.create()` 返回后立即且仅
调用一次，并在任何自定义 body parser 或其他 application middleware 之前调用。helper 从已创建的
Nest container 取得共享 context provider，生成 `http-${randomUUID()}`，忽略客户端
`X-Request-Id`，并同时建立 `AsyncLocalStorage` context 与响应 `X-Request-Id` header。

`apps/mist` 与 `apps/chan` 删除手工 `useGlobalPipes/useGlobalInterceptors/useGlobalFilters`。Chan 的
50 MB body parser 保留，但必须注册在 request-context helper 之后。exception filter 仅在正常
middleware 链之外确实不存在 context 时生成一次 fallback identity；正常请求的成功、失败和日志
不得重新生成 identity。该固定装配不提供 `forRoot()` 或 per-app 配置。

shared `APP_PIPE` 使用 `ValidationPipe`，固定保留 `whitelist:true`、
`forbidNonWhitelisted:true`、`transform:true`，并显式禁止全局 implicit conversion；DTO 自己声明的
`@Type()`/`@Transform()` 仍可执行。validation exception factory 递归展开 class-validator children，
使用 `parent.child.0.field` 点分路径收集 constraints；父节点和子节点各自 constraints 均保留，同一路径
消息合并，并按稳定 path/constraint 顺序输出。公共响应不得包含 validator 的 target、value、children
或原始输入。

DTO validation 固定输出真实 400、`code=VALIDATION_ERROR`、安全 message
`Request validation failed` 和非空字段 errors。malformed JSON、普通 `BadRequestException`、Parse*
pipe 等非 DTO validation failure 使用 `BAD_REQUEST`，不得伪造字段 errors。validation 不启用
stop-at-first-error；其他错误完全省略 errors。

Swagger/OpenAPI 通过 shared `ApiEnvelopeResponse` 与 `ApiTechnicalErrorResponse` 描述真实 envelope。
`ApiEnvelopeResponse` 使用 `ApiExtraModels/getSchemaPath/allOf` 把 generic data 指向 domain-owned VO；
当同一 HTTP 200 同时可能 success 与 expected business rejection 时，decorator 在同一个 response 中
使用 `oneOf` 组合 success schema 与 `businessRejections` variants。不得叠加多个相同 status 的
`@ApiResponse()`，因为后一个 metadata 会覆盖前一个。`ApiTechnicalErrorResponse` 对同一真实 4xx/5xx
status 的多个 code variants 同样使用 `oneOf`，但 endpoint 只声明真实可能发生的状态，不机械添加
所有技术错误。

真实 204 使用 no-content response，OpenAPI 不得包含 content 或 envelope schema。现有已经声明的
24 个 response decorators 迁移为 envelope-aware decorators，生成 schema 不得继续把 raw business
type 描述成整个 response body；未写 Swagger response 的 legacy endpoint 不在本 change 中补齐所有
业务 VO。现有 entity-backed data schema 暂不改变 wire 字段，后续由 owning domain 在实质修改时
抽取 VO；transport 不得持有 TypeORM entity。

HTTP DTO class 是字段定义和 Swagger metadata 的单一来源；不得继续维护一份字段可能漂移的平行
interface。domain-specific pattern、command、success/error type 和 decoder 不放入 `transport`，而由
对应 bounded-domain library 单一持有。V1 目标边界为：共享 evaluation/market-data port 位于
`libs/strategy`；Backtest command contract 位于 `libs/backtest/src/contracts`；Signal control-plane
contract 位于 `libs/signal/src/contracts`。不得建立全局 `libs/contracts`、`libs/protocol`，也不得把
这些 shared contracts 留在任一 `apps/*` source 下。

domain contract 是不含 Nest/HTTP/persistence decorator 的纯 TypeScript。发送方和接收方必须从同一
domain barrel 导入 pattern constant、versioned types 与 decoder，不得复制 raw pattern string。
公共 HTTP DTO 继续由 `apps/mist` 相应业务模块持有并显式映射到 domain command；DTO 不得直接作为
RPC data。`libs/strategy` 只接收真正由 Backtest 与 Signal 共同使用的策略计算契约，不持有 admission
queue 或 registry-refresh 等 process-control protocol。

library dependency 固定为有向无环：applications 可以依赖 transport 与自己的 domain libraries；
`libs/backtest`/`libs/signal` 仅在确有共享策略类型时单向依赖 `libs/strategy`；strategy 不反向依赖
Backtest/Signal，transport 不依赖任何 domain/shared-data。domain contract 自身也不导入 transport，
envelope 组合只发生在 application adapter，因此不会形成 transport-domain cycle。TypeORM entity
继续位于 shared-data，ConfigService/env/ClientProxy/MessagePattern 位于 application/adapter。

`@app/backtest`、`@app/signal`、`@app/strategy` 只提供精确 root barrel alias，不提供 wildcard；
library 外部不得 deep import。static contract test 必须扫描受影响目录，阻止 transport→domain、
strategy→backtest/signal、domain-contract→Nest/HTTP/Swagger/TypeORM/Redis、app-to-app source import、
外部 deep import，以及 caller/handler 重复 raw pattern string。

### 2. HTTP 与 RPC 保持两套明确 envelope

公共 HTTP 继续使用：

```ts
ApiResponseDto<T> = {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  requestId: string;
  path: string;
}

ApiErrorDto<TCode extends string, TData = never> = {
  success: false;
  statusCode: number;
  code: TCode;
  message: string;
  data?: TData;
  errors?: Record<string, string[]>;
  timestamp: string;
  requestId: string;
  path: string;
}
```

内部 RPC V1 使用：

```ts
RpcRequestV1<TData> = {
  meta: { correlationId: string };
  data: TData;
}

RpcResultV1<TData, TErrorCode, TErrorData = never> =
  | {
      ok: true;
      meta: { correlationId: string };
      data: TData;
    }
  | {
      ok: false;
      meta: { correlationId: string };
      error: { code: TErrorCode; data?: TErrorData };
    }
```

RPC 不使用 HTTP 的 `success/statusCode/message/timestamp/requestId/Location`。`ok=false` 只表达调用方
可以识别的业务拒绝；非预期异常使用 Nest RPC error channel，不能伪造成任意业务 code。

Nest RPC error channel 的 strict request/domain decoder failure 和非预期异常必须经过 shared
exception filter fail closed，并使用固定安全结构：

```ts
RpcTransportErrorV1 = {
  status: 'error';
  message: 'RPC_INVALID_REQUEST' | 'RPC_INTERNAL_ERROR';
}
```

`RpcTransportErrorV1` 不是 `RpcResultV1` 的第三个 branch，也不增加 domain error code。非法 request
envelope 或 domain command 使用 `RPC_INVALID_REQUEST`；handler 的数据库、程序和其他未知异常使用
`RPC_INTERNAL_ERROR`。filter 必须返回 Nest RPC 要求的 Observable error，并在服务端日志保留当前
application、pattern、可用的 correlation 和原始异常，但 wire 不得包含 exception、stack、SQL、
driver message、constraint、provider raw payload 或任意内部对象。

调用方必须通过 request-response error channel 接收该错误，并在自己的 adapter 边界决定公共
结果。它不得把任一 transport error 解释成 domain-owned `ok=false` code。

TypeScript generic 不提供 runtime validation。shared pure decoder 必须严格校验 request 顶层只有
`meta/data`、meta 只有 correlationId，且 correlation 匹配 `^[A-Za-z0-9._:-]{1,128}$`；data 交给
owning domain decoder。RPC controller 使用 `@RpcContract(domainDecoder)` 组合安装 shared
`RpcValidationPipe` 与 `RpcExceptionFilter`，非法 envelope/domain data 在 handler 执行前进入
`RPC_INVALID_REQUEST` error channel。

caller 对正常 result 再执行 strict decoder：success 顶层只能为 `ok/meta/data`，rejection 只能为
`ok/meta/error`，meta 与 error 也拒绝未知字段；两个 branch 同时存在、都不存在或字段落错 branch
均拒绝。success data、error code 和可选 error data 由 domain decoder 校验；当 owning contract 的
error data 为 never 时，domain decoder 必须拒绝该字段。result correlation 必须与原 request 完全
一致，否则作为 transport failure，不能解释成业务 rejection。malformed raw wire 不进入公共响应或
日志。

`RpcTransportModule` 只 provide/export decoder、pipe、decorator 和 filter，不注册全局 APP_FILTER。
RPC controller 显式使用 `@RpcContract()`；hybrid runtime 以 `inheritAppConfig:false` 连接 microservice，
防止 HTTP global pipe/filter 进入 TCP handler。新增 `@nestjs/microservices@10.4.15` 与当前 Nest
common/core patch 对齐。ClientProxy 连接失败和 timeout 不属于 result decoder，由 owning adapter
映射为明确 dependency status。

### 3. HTTP status 和 message 必须来自明确 owner

success interceptor 从 HTTP response object 读取真实 `statusCode`，不得固定为 `200`。业务成功
message 通过 `@HttpResponseMessage('...')` metadata 显式声明，未声明时使用 `SUCCESS`。interceptor
不得检查或提取业务返回对象的 `message` 属性，避免 envelope 与业务 data 混层。

异常过滤器使用真实 exception status；结构化 `HttpException` response 只允许读取
`code/message/data/errors`。`code` 必须是非空稳定字符串，否则使用真实 status 对应的 transport
default code；显式存在的 typed `data` 才可进入 `ApiErrorDto.data`。`errors` 只允许出现在
`400 + VALIDATION_ERROR`，其他错误直接省略该字段，不输出 `errors:null`。

transport default code 固定为：validation 使用 `VALIDATION_ERROR`；普通 400 或未单列 4xx 使用
`BAD_REQUEST`；401/403/404/409/429 分别使用 `UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、
`CONFLICT`、`TOO_MANY_REQUESTS`；502/503/504 分别使用 `BAD_GATEWAY`、
`SERVICE_UNAVAILABLE`、`GATEWAY_TIMEOUT`；500 或未单列 5xx 使用 `INTERNAL_ERROR`。若异常携带
非错误 status（例如 200），filter 必须改为真实 500 + `INTERNAL_ERROR`，不得借异常通道伪造
business rejection。

公共 HTTP code 必须是字符串并匹配 `^[A-Z][A-Z0-9_]{0,63}$`。不得接受空值、数字、空格、连字符
或 lowercase RPC code，也不得执行 String()/uppercase compatibility conversion。
`HttpBusinessRejection` 在构造时校验；非法 business code 作为程序错误进入 500
`INTERNAL_ERROR`。exception filter 只接受合法 structured code：4xx 缺失/非法时使用 status default；
5xx 缺失/非法时除使用 default code 外，原 structured message/data 也 fail closed。

已明确的 domain condition 优先使用领域 code，transport default 只兜底。例如 RPC `queue_full`
由 Backtest HTTP adapter 显式映射为真实 429 + `BACKTEST_QUEUE_FULL`；Nest throttler 等无更具体领域
语义的 429 使用 `TOO_MANY_REQUESTS`。RPC lowercase code 不直接透传或自动改写为 HTTP code。
OpenAPI 对已知 code 声明 enum，consumer 只按字符串 code 分支。

4xx 结构中的安全字符串 message 可以保留。5xx 普通字符串 response 必须 fail closed，使用对应
technical code 的安全默认 message；只有显式结构化、携带合法 code 且由 adapter 批准的 response
才可透传其 safe message/data。`error/statusCode/stack/cause/SQL/driver message/constraint` 和其他任意
exception 字段不得复制到公共响应。response-time 使用 UTC ISO timestamp，path 使用不含 query
string 的 request path。

transport 不导入 TypeORM，也不通过 `instanceof QueryFailedError` 决定公共响应。未知数据库异常、
普通程序错误和非法抛出值对外都使用真实 500 + `INTERNAL_ERROR`；原始异常类型、message 和 stack
仍进入受控 boundary log。只有 domain owner 精确认识的 constraint conflict 才能在业务层转换为
显式 domain outcome，HTTP filter 不根据 driver message 或 constraint 片段猜测业务语义。

同步 HTTP 铨路由 exception filter 记录最终 authoritative boundary log：expected business rejection
不记 error stack；400/401/403/404/409 与 429 记一条无 stack 的 warning；500/502/503/504 记一条
包含 requestId 与原始 exception/cause 的 error。repository、service 或 provider adapter 若只会原样
抛出或包装后继续抛出，不得提前重复 `logger.error()`；需要增加 provider/operation context 时使用
保留原始 cause 的受控 exception wrapping，而不是打印后再抛。

不会进入 HTTP filter 的 scheduled/batch task、BullMQ worker、realtime consumer、startup 和 HIL
runner 继续由各自最外层任务边界记录失败。共享底层函数不拥有最终日志。HTTP 日志只包含必要的
method、无 query 的 path、status、code、requestId 以及仅 5xx 所需的 exception type/stack/cause；
不得记录 request body、完整 query、SQL 参数、provider raw payload、token、cookie 或凭据。本 change
只清理受迁移 HTTP call chain 中明确的 `log + rethrow`，不扩张为全仓后台日志重构。

`ApiErrorDto.code` 是稳定机器语义，`message` 是安全可读信息；两者不得继续混用。expected business
rejection 不是链路异常：public adapter 只有在明确把本地 application outcome 或某个 RPC rejection
分类为正常业务拒绝后，才构造 shared generic `HttpBusinessRejection<TCode,TData>` class instance；
response interceptor 只通过 `instanceof` 识别该 marker，并以实际 `200 OK` 输出
`success=false/statusCode=200/code/message/data`。不得根据普通对象字段、`success=false` 或任意
`RpcResultV1.error.code` 猜测 business rejection。

该 generic marker 只能携带 adapter 已批准的 code、message 和 typed data，不得持有任意 exception、
HTTP status override 或 retry hint，也不得把业务 enum 收进 transport library。RPC adapter 必须由
owning domain 显式分类：business outcome 可以创建 marker；capacity、availability、deadline 和
unexpected dependency failure 分别抛出其明确 4xx/5xx HTTP exception。shared transport 不维护
RPC code 到 HTTP status 的映射表。

DTO/contract validation、authentication、authorization、HTTP route-not-found、dependency failure、
service unavailable、deadline 和 unexpected internal error 继续使用真实 `4xx/5xx`，由 exception
filter 输出 `success=false`、必填稳定 technical code 与相同的真实 `statusCode`。禁止实际 response
为 200，却在 body 写 `statusCode: 404/409/500`；body `statusCode` 始终只是 HTTP status line 的镜像。
这一规则允许监控按 HTTP status 识别协议/链路健康，同时让业务 consumer 按 `success/code` 处理正常
业务拒绝。

success interceptor 的分支固定如下：正常结果保留 Nest 已确定的 200/201/202 等真实 status，并把
`undefined` 规范化为 `data:null`；显式 `HttpBusinessRejection` instance 才把实际 status 改为 200
并输出 error envelope；异常继续进入 exception filter；真实 204 不输出 JSON body，但仍保留
`X-Request-Id`。合法业务 `null` 不得被拒绝或改写为其他 sentinel。

### 4. 一个 HTTP request identity 贯穿首条 RPC 链路

HTTP 请求进入应用时生成一个非空服务器侧 `requestId`，并存入 request context。success
interceptor、exception filter 和该请求产生的日志都读取同一值。由该 HTTP 请求触发内部 RPC 时，
sender 将相同值作为 `RpcRequestV1.meta.correlationId`；RPC handler 必须在
`RpcResultV1.meta.correlationId` 原样返回。

request-context middleware 必须早于 Nest body parser 和 application middleware 安装，使非法
JSON 等 controller 之前的失败也能复用同一 request identity。若错误发生在该正常链之外，exception
filter 可以生成一次 fallback identity，并把同一值用于 header、body 与 authoritative log；该
fallback 不得覆盖已经存在的 context identity。

HTTP identity 格式固定为 `http-${randomUUID()}`，客户端 `X-Request-Id` 被忽略；middleware 使用
`AsyncLocalStorage.run(context,next)` 覆盖完整请求且不得使用全局可变 current id。一个 HTTP request
并行发出的多个 RPC 复用同一 correlation，并以 pattern + domain identity 区分调用，不新增 spanId。
result correlation mismatch 必须作为 transport failure 拒绝，不能变成 domain rejection 或把 raw
result 对外返回。

RPC safe error-channel object 不重复携带 correlation；caller 使用当前 send attempt 已知的 correlation
记录错误。服务端只有在 raw correlation 通过格式校验后才可写日志，缺失/非法值省略且不得原样记录。
启动补偿等非 HTTP producer 为每个逻辑 command attempt 生成独立 `rpc-${randomUUID()}`；不得让整个
batch 共用一个 identity。handler 若同步调用下一跳 RPC，由 adapter 显式继续传递收到的 correlation，
V1 不增加 RPC ALS。

correlation 只用于 observability，不作为 run/job/Signal idempotency identity，不持久化、不新增 DB
字段，也不承诺自动注入所有既有 Nest Logger。V1 只保证 boundary/access/error log 与显式读取
`HttpRequestContextService` 的日志，不引入 OpenTelemetry、traceparent 或 span tree。

非 HTTP producer 在自己的接受边界生成 correlation id。domain idempotency identity（例如
`BacktestRun.id`）不得被 correlation id 取代。V1 不直接信任客户端 `X-Request-Id`；未来若接受，
必须另行设计长度、字符、provenance 和 abuse boundary。

### 5. RPC pattern 和版本规则统一

所有 NestJS request-response pattern 使用 `domain.resource.action.vN`，例如
`backtest.run.submit.v1`。V1 payload 不重复放置 `contractVersion`。改变必填字段、字段语义、结果
union 或错误码解释时必须创建新的 pattern 版本，并按 consumer-first 顺序切换；不得静默让严格
V1 decoder 接受不同语义。

严格 decoder 使新增所谓 optional field 也成为 incompatible wire change。request/result 字段增删改、
type/nullability/unit/meaning、success/rejection union、error-code set、error.data presence、correlation 或
idempotency 含义，以及使既有合法消息失效的 validation 收紧，都必须引入 `.v2` 及对应 V2 domain
types/decoder。实现修复到既有 V1 文字、内部算法/日志/监控/数据库实现、HTTP adapter mapping 和不在
wire 中的 runtime config 变化不升级 pattern。若共享 RPC envelope 自身变更，采用新 envelope 的每个
业务 pattern 也必须升级。

升级按 handler-first 执行：接收方先并行注册 V1/V2，验证后 caller 再切 V2，确认无 V1 traffic 后才
由后续明确 change 删除 V1。caller 不得在 V2 timeout/connection error 后自动 fallback 发送 V1，
因为原命令可能已经执行。V1/V2 不做 runtime negotiation，payload 不增加 contractVersion。真实发布
后的版本不可静默扩大；尚未实现发布的初始 contract 可以在 implementation gate 前直接修正文档。

每个业务 command 使用自己的 typed data、error-code union、validation 和 idempotency identity。
共享外壳不得增加通用 `retryable`、任意 `details` 或自动恢复含义；这些策略由 owning change 明确
决定。

### 6. 现有与未来 consumer 使用同一边界

`apps/mist` 与 `apps/chan` 迁移到 shared HTTP implementation，`apps/chan` 不再从
`apps/mist/src` 导入旧 HTTP interceptor、exception filter 或 response contract。
`apps/chan` 当前对 `apps/mist/src/chan/chan.module` 的业务模块 import 不属于本 change，由
`extract-market-analysis-kernels` 抽取 shared kernel 并重接 adapters；本 change 不以消除该残留依赖
作为验收门禁。`apps/backtest`、`apps/signal` 和后续 request-response runtime 必须使用
`@app/transport/rpc` 的 request、result 和安全 exception filter，但其业务 message contract 分别
位于 `@app/backtest`、`@app/signal` 等 owning domain library；共享策略计算 contract 位于
`@app/strategy`。

## Risks / Trade-offs

- [consumer 只看 HTTP status 会漏掉 HTTP 200 business rejection] → 无论拒绝来自本地 application
  outcome 还是 RPC result，统一使用 generic marker；`ApiErrorDto.code` 必填，更新后端
  unit/integration/OpenAPI tests，并只读审计现有 frontend/skills 仍可消费既有 endpoint；严格 client
  迁移由 `harden-http-envelope-consumers` 独立交付。
- [OpenAPI 同一 200 的 success/business decorators 相互覆盖] → 使用一个 `ApiEnvelopeResponse` 在同一
  status 下生成 `oneOf`，technical variants 也按 status 合并。
- [success message 从 data 猜测会破坏业务对象] → 只允许显式 decorator，默认 `SUCCESS`。
- [error data 泄漏内部对象] → 只透传显式 typed data，未知异常 fail closed。
- [RPC lowercase code 或数字被直接当作公共 HTTP code] → HTTP code 使用 uppercase snake-case runtime
  validation，owning adapter 显式映射 domain code，transport default 只兜底且不做兼容转换。
- [客户端 request id 注入日志] → V1 始终生成服务器侧 identity。
- [后台补偿批次共用 correlation 无法定位单个 command] → 非 HTTP producer 为每个逻辑 attempt
  生成独立 `rpc-${randomUUID()}`；HTTP 并行子调用则复用 request correlation 并以 pattern/domain id
  区分。
- [transport 变成业务杂物箱] → 只允许通用 HTTP/RPC primitives，业务 DTO 和错误码留在 domain。
- [新增 domain libraries 形成循环依赖或 deep import] → 固定 application→transport/domain、
  backtest/signal→strategy 的单向图，并以 exact barrel alias 与 static contract test 阻止反向依赖。
- [RPC 与未来 event 混名] → `rpc/` 只服务 request-response；单向事件另建 `events/` change。
- [strict decoder 使 optional field rollout 短暂不兼容] → 所有 wire/semantic changes 升 pattern，按
  handler-first 并存切换；caller 禁止 timeout 后版本 fallback。
- [非预期异常通过 Nest RPC error channel 泄漏内部 message] → shared RPC exception filter 只发送
  固定 `RPC_INTERNAL_ERROR`，完整异常仅进入受控日志。
- [同一同步异常被 source/service/filter 重复记录] → HTTP filter 作为最终 authoritative log owner，
  清理本次迁移链路中明确的 `log + rethrow`，后台任务仍由自己的最外层 boundary 记录。

## Migration Plan

1. 记录 `apps/mist`、`apps/chan` 当前 envelope、OpenAPI、status、message、error 和 request-id tests。
2. 建立 `libs/transport/http`，迁移唯一 DTO 与 runtime implementation，为 error 增加必填 `code`，
   并实现只能由 class instance 显式触发的 generic business-rejection marker。
3. 同时切换 `apps/mist`、`apps/chan`，删除 bootstrap 和 controller 级旧 interceptor/filter、Chan
   对 Mist 旧 HTTP transport 实现的跨 app import 以及旧重复定义；保留由
   `extract-market-analysis-kernels` 负责的 Chan 业务模块拆分边界。
4. 建立 `libs/transport/rpc`、安全 RPC exception filter 和 strict contract tests，但不创建业务
   handler。
5. 只读审计 `mist-fe`、`mist-skills` 的当前兼容性，不修改其代码或 tests；运行完整 `mist` baseline
   和 strict OpenSpec validation。
6. 验收后允许 Backtest/Signal child change 引入各自业务 RPC contract，并允许
   `harden-http-envelope-consumers` 开始严格 consumer 迁移。

## Open Questions

- 无。已确认 library、HTTP/RPC 分层、必填 correlation、success/business message、stable error code、
  typed error data 与 expected-business-200 方案。
