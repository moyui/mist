## 1. 基线与影响链

- [ ] 1.1 记录 `mist`、`mist-fe`、`mist-skills` branch、HEAD、dirty/worktree 和 active changes。
- [ ] 1.2 建立 controller → interceptor/filter → HTTP wire → frontend/skills 与
  HTTP request → RPC sender → handler → result → HTTP adapter 影响链。
- [ ] 1.3 记录现有成功 200/201、expected business rejection、validation error、structured
  HttpException、unknown exception、requestId 和 Chan app contract tests。
- [ ] 1.4 审计 OpenAPI DTO、frontend unwrap、skills MistClient 对 `success/statusCode/message` 的真实
  依赖，以及新增必填 `code` 和 HTTP-200 business rejection 的迁移影响。

## 2. Shared Transport Library

- [ ] 2.1 创建 Nest library `transport`、`libs/transport`、`@app/transport/http` 与
  `@app/transport/rpc` exports。
- [ ] 2.2 迁移 HTTP envelope DTO，删除重复 interface/DTO 字段定义，并保留 Swagger metadata。
- [ ] 2.3 迁移 response interceptor、exception filter、response-message decorator 和 request
  context；禁止 transport library 依赖 strategy、market、TypeORM、Redis 或 provider code。
- [ ] 2.4 将 `apps/mist` 与 `apps/chan` 切换到 shared HTTP implementation，删除所有 application
  source import。

## 3. HTTP Contract 修复

- [ ] 3.1 使用真实 HTTP response status 填充成功 envelope `statusCode`，覆盖 200/201/202/204
  behavior，且不保留 body-200 compatibility branch。
- [ ] 3.2 实现 `@HttpResponseMessage()`，默认 `SUCCESS`，并证明业务 `data.message` 不会被自动提升。
- [ ] 3.3 实现 `ApiError<TCode,TData>` 的必填 stable `code` 与可选 typed `data`；`code` 用于机器
  分支、`message` 用于安全可读信息。只透传显式 approved data，validation `errors`、unknown
  exception fail-closed 和无 stack/raw leakage 保持成立。
- [ ] 3.4 实现 generic `HttpBusinessRejection<TCode,TData>` 与 interceptor mapping：本地 application
  outcome 和 RPC result 的 expected domain rejection 都使用真实 HTTP 200、
  `success=false/statusCode=200/code/message/data`；不得在 body 伪造 404/409，也不得把 domain enum
  放进 transport library。
- [ ] 3.5 在 HTTP 入口生成单一服务器侧 `requestId`，成功、失败和日志复用；拒绝未经验证的客户端
  request-id 覆盖。
- [ ] 3.6 更新 Swagger/OpenAPI、interceptor/filter/integration tests 和 Chan HTTP contract tests；
  覆盖 business 200、validation 400、dependency 502/503、deadline 504、unknown 500 及
  statusCode/code/message 分层。

## 4. RPC Contract

- [ ] 4.1 实现 `RpcRequestV1<T>` 与 `RpcResultV1<T, TCode>`，请求/响应都要求同一非空
  `meta.correlationId`。
- [ ] 4.2 实现 strict contract tests：缺失/空 correlation、both/neither result branch、未知字段、
  非法 error code adapter 和 correlation echo。
- [ ] 4.3 固定 `domain.resource.action.vN` 命名及 consumer-first 升级规则；V1 payload 不重复
  `contractVersion`。
- [ ] 4.4 证明 HTTP-only 字段、业务 payload/error code、idempotency、retry 和 arbitrary details
  未进入 shared RPC envelope。
- [ ] 4.5 实现 shared RPC exception filter 和固定
  `{status:error,message:RPC_INTERNAL_ERROR}` error-channel contract；覆盖数据库/未知异常、完整内部
  日志、调用方 error channel、无 stack/SQL/driver/constraint 泄漏，以及不得伪造 domain
  `ok=false` code。

## 5. Consumer 与验收

- [ ] 5.1 审计并更新 `mist-fe`、`mist-skills` contract tests，确认它们按 `success/code` 识别 HTTP
  200 business rejection，并兼容真实 success statusCode 和 typed error data。
- [ ] 5.2 运行 `mist` lint/typecheck/test/contract/build 完整基线及受影响 frontend/skills 基线。
- [ ] 5.3 执行本 change、相关 active changes 与 stable specs strict validation 和
  `git diff --check`。
- [ ] 5.4 全仓检索旧 response interface/DTO、body `statusCode: 200`、重复 requestId generator、
  `apps/chan -> apps/mist` import 和未分层 RPC envelope。
- [ ] 5.5 记录自动化通过、环境阻塞和未执行项；本 change 不需要交易终端 HIL。
