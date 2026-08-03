# 实施基线（2026-08-03）

## 仓库与 worktree

| 仓库/工作区 | branch | HEAD | dirty | 说明 |
|---|---|---|---|---|
| `mist/.worktrees/standardize-service-boundary-contracts` | `feat/standardize-service-boundary-contracts` | `917b646efbc2745c1b922ba59fa5dd72ed30cb70` | clean | 本 change 唯一写入工作区 |
| `mist` 主工作区 | `feat/productize-current-day-realtime-market-data` | `917b646efbc2745c1b922ba59fa5dd72ed30cb70` | clean | 保持 B1 分支，不写产品代码 |
| `mist-fe` | `feat/design-system-phase0` | `6515bfedbc47afe10061b289033636998354aba5` | clean | 本 change 只读 |
| `mist-skills` | `feat/productize-current-day-realtime-market-data` | `9458f26f67eb69fee6136db5b0f72a3b222462ec` | clean | 本 change 只读 |

`mist` 还存在 `feat/alert-delivery-wecom` 与 `feat/strategy-portfolio-backtesting` worktree；本 change 不
读取或写入其未合并实现。实施开始时 active OpenSpec changes 为：
`standardize-service-boundary-contracts`、`run-realtime-strategy-evaluation`、
`migrate-qmt-realtime-to-native-subscription`、`harden-http-envelope-consumers`、
`extract-market-analysis-kernels`、`extract-backtest-runtime`、
`evolve-strategy-evaluation-contract`、`deliver-strategy-notifications`、
`define-mist-production-roadmap`、`containerize-tdx-qmt-datasources`、
`complete-current-day-realtime-candles`、`capture-realtime-provider-anomalies`。

工作区外的 `mist-deploy/docker/.env.example` 在实施前已经 dirty，属于用户改动；本 change 不接触
`mist-deploy`。

## 现有影响链

### 公共 HTTP

```text
apps/mist 或 apps/chan controller
  → 手工注册的 ValidationPipe
  → apps/mist TransformInterceptor
  → apps/mist AllExceptionsFilter
  → HTTP JSON envelope
  → mist-fe app/api/client.ts unwrapApiResponse
  → mist-skills shared/mist_client.py MistClient
```

- `apps/chan/src/main.ts` 直接跨 app source 导入 `apps/mist` interceptor/filter；Chan 业务模块的跨 app
  import 仍由 `extract-market-analysis-kernels` 持有，不属于本 change。
- `apps/mist` 的部分 controller 还重复使用 controller-level `@UseFilters(AllExceptionsFilter)`。
- HTTP success interface 与 Swagger DTO 分别位于
  `apps/mist/src/interfaces/response.interface.ts` 和 `apps/mist/src/dto/api-response.dto.ts`。

### 内部 RPC

实施基线中不存在 `ClientProxy`、`MessagePattern`、Nest TCP transport 或
`@nestjs/microservices` dependency。本 change 只建立：

```text
HTTP request context
  → future application RPC sender
  → @app/transport/rpc envelope/decoder
  → future bounded-domain handler
  → strict RpcResult/error channel
  → owning HTTP adapter mapping
```

Backtest/Signal pattern、payload、error code 与 handler 均不在本 change 创建。

## 现有 HTTP 行为与测试

- success：`TransformInterceptor` 对所有成功响应固定输出 body `statusCode=200`、`message=SUCCESS`；
  `POST /v1/securities` 的真实 status 已声明为 201，因此当前 status line/body 会漂移。默认 POST 201、
  future 202、204、`undefined` 均没有完整 contract coverage。
- expected business rejection：当前没有显式 marker；普通业务失败经 `HttpException` 进入真实 4xx/5xx。
- validation：两个 bootstrap 各自实现一份只展开顶层 property 的 exception factory，输出
  `message=VALIDATION_ERROR` 与字段 errors；nested children 未递归展开。
- structured `HttpException`：filter 只读取 `message/errors`，丢弃 `code/data`；普通错误还输出
  `errors:null`。
- unknown/database：filter 导入 TypeORM 与 `@app/constants`，把未知异常和名为 `QueryFailedError` 的
  对象映射为 500，但对外没有稳定 `code`。
- request identity：success 使用 `http-${Date.now()}-*`，error 使用独立 `err-${Date.now()}-*`；没有
  request-entry ALS、统一 `X-Request-Id` 或 malformed-JSON 早期 identity。
- logging：现有 filter 对 4xx 和 5xx 都执行 `logger.error(..., stack)`，focused tests 会输出 4xx stack。
- OpenAPI：仓库现有 24 个 `@ApiResponse` declarations；Chan Bi/Channel 用继承
  `ApiResponseDto<T>` 的 response VO 描述 envelope。

实施前 focused baseline 命令：

```text
node /Users/moyui/sean/mist/mist/node_modules/jest/bin/jest.js \
  apps/mist/src/interceptors/transform.interceptor.spec.ts \
  apps/mist/src/filters/all-exceptions.filter.spec.ts \
  apps/mist/src/chan/chan.controller.openapi.spec.ts \
  --runInBand --watchman=false
```

结果：3 suites passed，16 tests passed。主仓依赖被复用于 worktree；未安装依赖或修改 lockfile。

## Consumer 与 OpenAPI 兼容风险

### `mist-fe`

`unwrapApiResponse()` 只要求 `success` 为 boolean；成功读取 `data`，失败按
`message || error.message` 抛错。它不验证 `statusCode`、`code`、`timestamp`、`requestId`，并继续接受
bare payload。新增必填 backend `code` 不会立即破坏当前解包；实际 HTTP 200 + `success=false` 也会按
失败处理。但 strict envelope、code-based branch 和 bare-payload retirement 必须由
`harden-http-envelope-consumers` 修改，不能在本 change 触碰前端。

### `mist-skills`

`MistClient` 要求 JSON object 中 `success=true` 才返回 `data`；失败时把 body `statusCode` 写入
`MistApiError.error_code: int`，忽略真实 HTTP status 和字符串 `code`。现有测试还固定了
`statusCode=2001` 的伪业务码。因此新 backend wire 仍会被识别为失败，但 skills 不能获得新的稳定
业务 code，且类型语义已不兼容。该 consumer 迁移同样只能由
`harden-http-envelope-consumers` 交付。

### OpenAPI

本 change 必须迁移已有 response metadata，使 envelope schema 与真实 status 一致，并保留 domain
data reference；不得把 TypeORM entity/VO 移入 transport，也不得为所有未注解 endpoint 补造业务
文档。相同 HTTP status 的 success/business 与多个 technical variants 必须在单个 response metadata
中使用 `oneOf`，避免 decorator 覆盖。
