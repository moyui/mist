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
- 消除 HTTP contract 双份定义和 `apps/chan -> apps/mist` source import。
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
libs/transport/src/
├── http/
│   ├── api-response.dto.ts
│   ├── http-business-rejection.ts
│   ├── http-response.interceptor.ts
│   ├── http-exception.filter.ts
│   ├── http-response-message.decorator.ts
│   └── http-request-context.ts
└── rpc/
    ├── rpc-internal-error.type.ts
    ├── rpc-exception.filter.ts
    ├── rpc-request.interface.ts
    └── rpc-result.type.ts
```

HTTP consumer 使用 `@app/transport/http`，内部 request-response consumer 使用
`@app/transport/rpc`。`transport` 可以依赖 Nest transport/HTTP primitives，但不得依赖 strategy、
market、TypeORM entity、Redis 或 provider adapter。

HTTP DTO class 是字段定义和 Swagger metadata 的单一来源；不得继续维护一份字段可能漂移的平行
interface。domain-specific command DTO/pattern 不放入 `transport`，而由对应 domain library 持有。

### 2. HTTP 与 RPC 保持两套明确 envelope

公共 HTTP 继续使用：

```ts
ApiResponse<T> = {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  requestId: string;
  path?: string;
}

ApiError<TCode extends string, TData = never> = {
  success: false;
  statusCode: number;
  code: TCode;
  message: string;
  data?: TData;
  errors?: Record<string, string[]> | null;
  timestamp: string;
  requestId: string;
  path?: string;
}
```

内部 RPC V1 使用：

```ts
RpcRequestV1<T> = {
  meta: { correlationId: string };
  data: T;
}

RpcResultV1<T, TCode> =
  | {
      ok: true;
      meta: { correlationId: string };
      data: T;
    }
  | {
      ok: false;
      meta: { correlationId: string };
      error: { code: TCode };
    }
```

RPC 不使用 HTTP 的 `success/statusCode/message/timestamp/requestId/Location`。`ok=false` 只表达调用方
可以识别的业务拒绝；非预期异常使用 Nest RPC error channel，不能伪造成任意业务 code。

Nest RPC error channel 的非预期异常必须经过 shared exception filter fail closed，并使用固定安全
结构：

```ts
RpcInternalErrorV1 = {
  status: 'error';
  message: 'RPC_INTERNAL_ERROR';
}
```

`RpcInternalErrorV1` 不是 `RpcResultV1` 的第三个 branch，也不增加 domain error code。它只用于把
非预期异常与正常 accepted/rejected result 分离。filter 必须在服务端日志保留当前 application、
pattern、可用的 correlation 和原始异常，但 wire 不得包含 exception、stack、SQL、driver
message、constraint、provider raw payload 或任意内部对象。

调用方必须通过 request-response error channel 接收该错误，并在自己的 adapter 边界决定公共
结果。它不得把 `RPC_INTERNAL_ERROR` 解释成任意 domain-owned `ok=false` code。

### 3. HTTP status 和 message 必须来自明确 owner

success interceptor 从 HTTP response object 读取真实 `statusCode`，不得固定为 `200`。业务成功
message 通过 `@HttpResponseMessage('...')` metadata 显式声明，未声明时使用 `SUCCESS`。interceptor
不得检查或提取业务返回对象的 `message` 属性，避免 envelope 与业务 data 混层。

异常过滤器使用真实 exception status；结构化 `HttpException` response 中显式存在的 `data` 才可
进入 `ApiError.data`。validation 字段错误仍进入 `errors`。未知异常只返回稳定内部错误 message，
不得把 exception、stack、SQL 或 provider raw payload 放入响应。

`ApiError.code` 是稳定机器语义，`message` 是安全可读信息；两者不得继续混用。expected business
rejection 不是链路异常：public adapter 将本地 application outcome 或 approved
`RpcResultV1.error.code` 映射为 shared generic `HttpBusinessRejection<TCode,TData>`，response
interceptor 以实际 `200 OK` 输出
`success=false/statusCode=200/code/message/data`。该 generic marker 只能携带 adapter 已批准的 code、
message 和 typed data，不得持有任意 exception、HTTP status override 或 retry hint，也不得把业务
enum 收进 transport library。

DTO/contract validation、authentication、authorization、HTTP route-not-found、dependency failure、
service unavailable、deadline 和 unexpected internal error 继续使用真实 `4xx/5xx`，由 exception
filter 输出 `success=false`、必填稳定 technical code 与相同的真实 `statusCode`。禁止实际 response
为 200，却在 body 写 `statusCode: 404/409/500`；body `statusCode` 始终只是 HTTP status line 的镜像。
这一规则允许监控按 HTTP status 识别协议/链路健康，同时让业务 consumer 按 `success/code` 处理正常
业务拒绝。

### 4. 一个 HTTP request identity 贯穿首条 RPC 链路

HTTP 请求进入应用时生成一个非空服务器侧 `requestId`，并存入 request context。success
interceptor、exception filter 和该请求产生的日志都读取同一值。由该 HTTP 请求触发内部 RPC 时，
sender 将相同值作为 `RpcRequestV1.meta.correlationId`；RPC handler 必须在
`RpcResultV1.meta.correlationId` 原样返回。

非 HTTP producer 在自己的接受边界生成 correlation id。domain idempotency identity（例如
`BacktestRun.id`）不得被 correlation id 取代。V1 不直接信任客户端 `X-Request-Id`；未来若接受，
必须另行设计长度、字符、provenance 和 abuse boundary。

### 5. RPC pattern 和版本规则统一

所有 NestJS request-response pattern 使用 `domain.resource.action.vN`，例如
`backtest.run.submit.v1`。V1 payload 不重复放置 `contractVersion`。改变必填字段、字段语义、结果
union 或错误码解释时必须创建新的 pattern 版本，并按 consumer-first 顺序切换；不得静默让严格
V1 decoder 接受不同语义。

每个业务 command 使用自己的 typed data、error-code union、validation 和 idempotency identity。
共享外壳不得增加通用 `retryable`、任意 `details` 或自动恢复含义；这些策略由 owning change 明确
决定。

### 6. 现有与未来 consumer 使用同一边界

`apps/mist` 与 `apps/chan` 迁移到 shared HTTP implementation，`apps/chan` 不再导入
`apps/mist/src`。`apps/backtest`、`apps/signal` 和后续 request-response runtime 必须使用
`@app/transport/rpc` 的 request、result 和安全 exception filter，但其业务 message contract 位于
相应 domain library。

## Risks / Trade-offs

- [consumer 只看 HTTP status 会漏掉 HTTP 200 business rejection] → 无论拒绝来自本地 application
  outcome 还是 RPC result，统一使用 generic marker；`ApiError.code` 必填，更新
  unit/integration/OpenAPI tests，并审计 frontend/skills 按 `success/code` 解析；不允许 body
  `statusCode` 冒充业务码。
- [success message 从 data 猜测会破坏业务对象] → 只允许显式 decorator，默认 `SUCCESS`。
- [error data 泄漏内部对象] → 只透传显式 typed data，未知异常 fail closed。
- [客户端 request id 注入日志] → V1 始终生成服务器侧 identity。
- [transport 变成业务杂物箱] → 只允许通用 HTTP/RPC primitives，业务 DTO 和错误码留在 domain。
- [RPC 与未来 event 混名] → `rpc/` 只服务 request-response；单向事件另建 `events/` change。
- [非预期异常通过 Nest RPC error channel 泄漏内部 message] → shared RPC exception filter 只发送
  固定 `RPC_INTERNAL_ERROR`，完整异常仅进入受控日志。

## Migration Plan

1. 记录 `apps/mist`、`apps/chan` 当前 envelope、OpenAPI、status、message、error 和 request-id tests。
2. 建立 `libs/transport/http`，迁移唯一 DTO 与 runtime implementation，为 error 增加必填 `code`，
   并实现 generic business-rejection marker。
3. 同时切换 `apps/mist`、`apps/chan`，删除跨 app import 和旧重复定义。
4. 建立 `libs/transport/rpc`、安全 RPC exception filter 和 strict contract tests，但不创建业务
   handler。
5. 审计 `mist-fe`、`mist-skills`，运行完整 `mist` baseline 和 strict OpenSpec validation。
6. 验收后允许 Backtest/Signal child change 引入各自业务 RPC contract。

## Open Questions

- 无。已确认 library、HTTP/RPC 分层、必填 correlation、success/business message、stable error code、
  typed error data 与 expected-business-200 方案。
