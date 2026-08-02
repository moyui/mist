## Why

Mist 的公共 HTTP envelope 目前同时由 TypeScript interface 和 Swagger DTO 重复定义，成功响应体
把 `statusCode` 固定为 `200`、成功 `message` 固定为 `SUCCESS`，异常过滤器又会丢弃结构化错误
`data` 并重新生成另一套 `requestId`。`apps/chan` 还跨 application source 导入 `apps/mist` 的
HTTP interceptor/filter。随着 `apps/backtest`、`apps/signal` 等独立 Nest runtime 引入，需要先建立
公共 HTTP 与内部 RPC 两套明确、共享且可扩展的服务边界。

## What Changes

- 新建单词命名的 Nest library `transport`，目录为 `libs/transport`，并使用独立子路径
  `@app/transport/http` 与 `@app/transport/rpc`。
- `http` 作为 Mist 公共 HTTP envelope、Swagger DTO、response interceptor、exception filter、
  显式 response-message decorator 和 request context 的唯一 owner。
- 成功 envelope 的 `statusCode` 使用真实 HTTP response status；成功 `message` 默认 `SUCCESS`，
  需要业务消息时必须使用显式 `@HttpResponseMessage()`，不得从业务 `data.message` 猜测。
- `ApiError<TCode,TData>` 增加必填稳定 `code` 与可选 typed `data`，`code` 用于程序分支、`message`
  用于安全可读信息。expected business rejection 使用实际 HTTP 200、`success=false` 和 domain code；
  validation/auth/route/dependency/timeout/internal failure 继续使用真实 4xx/5xx，所有 body
  `statusCode` 只镜像真实 status。
- 每个 HTTP 请求在入口只生成一个服务器侧 `requestId`，成功响应、错误响应、日志和内部 RPC
  `correlationId` 复用同一值；V1 不信任或回显未经验证的客户端 request-id。
- `rpc` 定义所有 NestJS request-response 内部调用共用的 `RpcRequestV1<T>` 和
  `RpcResultV1<T, TCode>`；请求与响应都必须携带同一个非空 `correlationId`。
- RPC message pattern 使用 `domain.resource.action.vN`；pattern 版本是 wire 版本，payload 不再重复
  `contractVersion`。业务 payload、业务错误码和幂等 identity 留在各自 domain library。
- 将 `apps/mist` 和 `apps/chan` 切换到共享 HTTP adapter，删除跨 app source import，并为未来
  `apps/backtest`、`apps/signal` 提供共同 RPC 前置门禁。
- 本 change 不定义任何 Backtest、Signal 或 notification 业务命令，也不修改数据库 schema。

## Capabilities

### New Capabilities

- `service-boundary-contracts`: 定义 Mist 公共 HTTP 与内部 RPC 的共享 transport library、envelope、
  correlation、版本和 app dependency 边界。

## Impact

- **`mist`**：新增 `libs/transport`，迁移现有 HTTP interface/DTO/interceptor/filter，并修订
  `apps/mist`、`apps/chan` bootstrap、OpenAPI 和 tests。
- **HTTP/API**：保留既有 envelope 字段并为 error 增加必填 `code`；修正成功 body `statusCode`、
  显式 success/business message、typed `data` 和单一 request identity。expected business rejection
  使用实际 200 + `success=false/code`，不在 body 伪造 404/409；protocol/dependency/internal failure
  继续使用真实 4xx/5xx。
- **内部 RPC**：新增 transport-agnostic V1 request/result envelope 和必填 `correlationId`，但不
  创建业务 message pattern。
- **`mist-fe` / `mist-skills`**：执行兼容性审计和 contract tests；新增可选 error `data` 不要求现有
  consumer 立即消费。
- **前置关系**：`extract-backtest-runtime` 与 `run-realtime-strategy-evaluation` 的 RPC 产品代码
  必须等待本 change 验收。
- **数据库/部署**：不新增 migration、service、port 或 volume。
