## Context

`mist-fe/app/api/client.ts` 当前把带 boolean `success` 的对象视为 envelope，但也直接接受裸 payload；
非 2xx response 只要 body 意外为 `success=true` 仍可能被当成成功。`mist-skills/shared/mist_client.py`
则不校验真实 HTTP status 与 body `statusCode` 的一致性，并把后者保存为数字业务 `error_code`。
`shared/kline_runner.py` 还使用 `{400, 404}` 决定是否自动采集，`shared/script_runner.py` 会把该数字打印
为 Mist API error identity。

前置 change `standardize-service-boundary-contracts` 将公共 HTTP response 固定为
`ApiResponseDto/ApiErrorDto`，让 `statusCode` 只镜像真实 status，并为 error 增加稳定字符串 `code`。
本 change 在该后端契约归档后，独立迁移两个跨仓 consumer；不与 transport library 的交付揉在一起。

## Goals / Non-Goals

**Goals:**

- 两个 client 严格区分有效 success、有效 business/technical error、malformed response 和网络失败。
- 按 `code` 而非 body `statusCode` 执行业务错误分支，同时保留真实 `httpStatus` 供诊断。
- 让 HTTP 200 expected business rejection 与非 2xx technical failure 产生同一种 typed API error。
- 明确 204 no-content 的独立 client 路径，并保留 server-generated `X-Request-Id`。
- 用 contract tests 锁定 frontend 和 Python consumer 的一致语义。

**Non-Goals:**

- 不修改后端 envelope、OpenAPI、controller、RPC、数据库或部署。
- 不修改 React 页面、组件和用户交互。
- 不改变具体 Skills 的业务输出或新增自动恢复、重试和采集策略。
- 不建立跨 TypeScript/Python 的运行时代码包；公共 wire 的 source of truth 仍是后端 OpenAPI/spec。

## Decisions

### 1. 后端 boundary change 是硬前置

实现前必须确认 `standardize-service-boundary-contracts` 已归档，部署后的 Mist/Chan responses 对
success/error 都携带真实 `statusCode`，error 都携带非空字符串 `code`。consumer-first 不适用于这里：
严格 client 若先部署，会拒绝旧 error envelope。

### 2. External HTTP consumer 严格校验必填语义，但容忍新增字段

两个 client 都要求非 204 JSON response 是对象，并校验 `success/statusCode/message/timestamp/requestId/path`
及对应 branch 的 `data` 或 `code`。body `statusCode` 必须等于真实 status。裸 payload、缺失必填字段、
错误 branch 和真实 status 矛盾均为 contract error。

外部 HTTP envelope 不像内部 RPC 那样拒绝所有未知字段；consumer 忽略未知 additive 字段，避免后端在
保持既有语义时增加可选观测字段也必须同步发布所有客户端。已知字段若出现错误类型仍必须拒绝。

### 3. 有效 API error 与 malformed response 使用不同异常

`mist-fe` 使用 `MistApiError<TData>` 保存 `code/message/httpStatus/requestId/data/errors`，并使用
`MistApiContractError` 表示 non-JSON、裸 payload、status mismatch 或 branch malformed。

`mist-skills` 保留 `MistConnectionError` 处理 connection/timeout，使用新的 `MistApiError` 保存相同的
公共错误字段，并新增 `MistApiContractError`。有效 HTTP 200 business rejection 和有效非 2xx
technical failure 都产生 `MistApiError`；malformed response 不再伪装成 server-declared API error。

### 4. `statusCode` 不再承担业务分支

`MistApiError.error_code: int` 退役，替换为 `code: str` 与 `http_status: int`。Skills 的自动采集 allowlist
改为 stable error-code allowlist，CLI 显示 `code`；不得继续用任意 400/404 作为业务条件。具体 allowlist
必须从归档后的 backend contract 审计得出，本 change 不扩大原有自动采集范围。

### 5. 204 使用显式 no-content client

返回业务 JSON 的 helper 遇到 204 时视为 contract mismatch。只有显式声明 `void` 的
`requestNoContent`/Python equivalent 接受 204，并读取 response header `X-Request-Id`；它不得尝试解析
JSON 或构造空 success envelope。

### 6. 不生成跨语言 client

V1 直接维护 TypeScript 与 Python 的小型解析器和相同 contract fixtures。引入 OpenAPI code generator
会扩大 build、发布和依赖边界，不属于此次收紧。测试必须覆盖相同的 success、business 200、technical
failure、malformed 和 204 fixtures，减少两端语义漂移。

## Risks / Trade-offs

- [严格 client 会暴露历史裸 response/mocks] → 实施前盘点真实 endpoint 与 tests；只修正 mock 和已经
  违反统一 envelope 的服务端问题，不恢复裸 payload fallback。
- [consumer 先发布后端尚未带 code] → 将后端 change 归档和部署验证设为实施门禁。
- [Skills 继续按宽泛 HTTP status 自动采集] → 改为审计后的 stable code allowlist，并用负向测试证明
  相邻 400/404 code 不会触发采集。
- [忽略未知字段降低完全 strict 程度] → 仍严格校验全部已知必填字段与 branch；仅允许 additive 字段以
  保持公共 HTTP 的前向兼容。
- [跨仓发布中间态] → 后端先部署，随后分别提交/验证 `mist-fe` 与 `mist-skills`；不要求原子多仓提交。

## Migration Plan

1. 验证并记录后端 boundary change 的归档 commit、OpenAPI 和运行时 fixtures。
2. 盘点 `mist-fe`、`mist-skills` branch/HEAD/dirty、裸 payload mocks 和 `error_code/statusCode` 分支。
3. 先实现两端 typed errors 与纯 parser tests，再切换实际 request helpers。
4. 将 Skills shared runner 从 HTTP status allowlist 迁移到已批准的 stable code allowlist。
5. 分别运行 frontend 与 Skills 完整基线，记录 breaking consumer migration。
6. 后端先部署；consumer 可独立发布。若 consumer 发布失败，保持旧 client，不回退后端 envelope。

## Open Questions

无。具体 Skills 自动采集 code allowlist 在实施基线中从已归档 backend contract 机械确定，不改变本
change 的边界决策。
