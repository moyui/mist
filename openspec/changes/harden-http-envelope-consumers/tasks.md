## 1. 前置门禁与跨仓基线

- [ ] 1.1 确认 `standardize-service-boundary-contracts` 已归档，记录归档 commit、OpenAPI 与
  success/business-200/technical-error/204 contract fixtures；未满足时不得开始 consumer 实现。
- [ ] 1.2 记录 `mist-fe`、`mist-skills` branch、HEAD、dirty/worktree、运行时版本和各自验证命令。
- [ ] 1.3 全仓盘点 frontend 裸 payload mocks、`unwrapApiResponse` 分支，以及 Skills
  `error_code/statusCode/KLINE_RETRY_STATUS_CODES` 的全部生产与测试引用。
- [ ] 1.4 从归档 backend contract 固定 K-line 自动采集允许的 stable error codes，并证明该 allowlist
  不扩大既有自动采集业务范围。

## 2. mist-fe Strict Consumer

- [ ] 2.1 在 API client 边界实现 `MistApiError<TData>` 和 `MistApiContractError`，保留
  `code/message/httpStatus/requestId/data/errors` 的明确类型。
- [ ] 2.2 实现纯 envelope parser：校验必填已知字段、success/error branch、真实 status 一致性，忽略
  additive unknown fields，并拒绝裸 payload。
- [ ] 2.3 将 request helper 切换到 strict parser；HTTP 200 business rejection 与有效非 2xx error
  均抛 `MistApiError`，malformed/non-JSON response 抛 `MistApiContractError`。
- [ ] 2.4 增加显式 no-content helper；204 不解析 JSON，data-returning helper 收到 204 时 fail closed，
  并覆盖 `X-Request-Id` 诊断信息。
- [ ] 2.5 更新 API client/fixture tests，覆盖 200/201 success、business 200、400/502/500、status
  mismatch、missing field、bare payload、invalid JSON、additive field 和 204；不得修改 React 页面或组件。

## 3. mist-skills Strict Consumer

- [ ] 3.1 将 `MistApiError.error_code` 迁移为 `code: str` 与 `http_status: int`，保留安全
  `message/request_id/data/errors`，并新增 `MistApiContractError`。
- [ ] 3.2 重写 `MistClient` response parser：校验真实 status、统一 envelope 和 branch，拒绝裸/non-JSON
  payload，并保持 connection/timeout 为 `MistConnectionError`。
- [ ] 3.3 为 Python client 增加显式 no-content operation；204 不解析 JSON，data helper 收到 204 时
  fail closed，并暴露 response-header request id。
- [ ] 3.4 将 `shared/kline_runner.py` 从数字 HTTP status allowlist 改为任务 1.4 的 stable-code
  allowlist；增加相同 HTTP status、不同 code 不触发采集的负向测试。
- [ ] 3.5 将 `shared/script_runner.py` 与相关 shared tests 机械迁移为显示/断言字符串 code；具体 Skills
  脚本输出与业务行为不得改变。
- [ ] 3.6 更新 MistClient contract fixtures，与 frontend 覆盖同一组 success/rejection/technical/
  malformed/additive/204 语义。

## 4. 验收与发布记录

- [ ] 4.1 运行 `mist-fe` lint/typecheck/test/build 与仓库既有质量门禁，单独记录自动化通过、环境阻塞
  和未执行项。
- [ ] 4.2 运行 `mist-skills` format/lint/typecheck/test 与 repository hygiene 门禁，单独记录自动化
  通过、环境阻塞和未执行项。
- [ ] 4.3 全仓检索裸 payload fallback、数字 `error_code`、body `statusCode` 业务分支和 UI/backend 越界
  修改；确认不存在未声明 compatibility branch。
- [ ] 4.4 执行本 change、stable specs 与相关 active changes 的 strict validation，以及三个仓库的
  `git diff --check`。
- [ ] 4.5 记录发布顺序为 backend boundary 已部署 → `mist-fe`/`mist-skills` 可独立发布；本 change 不
  需要数据库、Redis、交易终端或生产 HIL。
