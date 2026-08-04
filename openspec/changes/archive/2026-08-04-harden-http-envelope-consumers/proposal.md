## Why

`mist-fe` 当前允许裸 payload 并只按 `success/message` 解包，`mist-skills` 又把 body
`statusCode` 当作业务错误码。`standardize-service-boundary-contracts` 建立新的后端 envelope 后，需要
一个独立、可延期的 consumer change 严格迁移两个客户端，而不是把跨仓修改揉进 transport 基础 change。

## What Changes

- 依赖 `standardize-service-boundary-contracts` 完成并归档后再开始实现。
- `mist-fe` API client 严格解析统一 envelope，校验真实 HTTP status 与 body `statusCode`，并使用包含
  `code`、`httpStatus`、`requestId` 和 typed `data` 的 `MistApiError`。
- `mist-skills` `MistClient` 改读字符串 `code`，分离真实 HTTP status，不再把 `statusCode` 当业务码。
- 为 HTTP 200 expected business rejection、非 2xx technical failure、malformed envelope 和 204
  no-content 建立明确的 consumer 行为与 contract tests。
- **BREAKING**：两个 client 不再接受裸 payload；`MistApiError.error_code` 的数字业务码语义退役。
- 不修改 React 页面、组件、Skills 业务脚本输出、后端 envelope、RPC contract 或部署拓扑。

## Capabilities

### New Capabilities

- `http-envelope-consumers`: 定义 Mist 前端与 Python Skills client 对统一 HTTP envelope、业务拒绝、
  技术失败、malformed response 和 204 的严格消费契约。

### Modified Capabilities

无。

## Impact

- **`mist-fe`**：修改 `app/api/client.ts` 及 API client contract tests；不修改 UI。
- **`mist-skills`**：修改 `shared/mist_client.py`、依赖 `MistApiError.error_code` 的 shared runner 及对应
  tests；具体 Skills 业务脚本只在编译/测试要求下做机械类型适配，不改变用户输出。
- **`mist`**：只提供已归档的 HTTP/OpenAPI contract 作为前置，不在本 change 修改后端产品代码。
- **API**：不改变服务端 wire；本 change 只收紧 consumer validation，因此需要按仓库分别验证和提交。
- **数据库/部署**：无 migration、service、port、volume 或生产拓扑变化。
