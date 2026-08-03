## 1. 前置门禁与跨仓基线

- [x] 1.1 确认 `standardize-service-boundary-contracts` 已归档，记录归档 commit、OpenAPI 与
  success/business-200/technical-error/204 contract fixtures；未满足时不得开始 consumer 实现。
- [x] 1.2 记录 `mist-fe`、`mist-skills` branch、HEAD、dirty/worktree、运行时版本和各自验证命令。
- [x] 1.3 全仓盘点 frontend 裸 payload mocks、`unwrapApiResponse` 分支，以及 Skills
  `error_code/statusCode/KLINE_RETRY_STATUS_CODES` 的全部生产与测试引用。
- [x] 1.4 从归档 backend contract 固定 K-line 自动采集允许的 stable error codes，并证明该 allowlist
  不扩大既有自动采集业务范围。

## 2. mist-fe Strict Consumer

- [x] 2.1 在 API client 边界实现 `MistApiError<TData>` 和 `MistApiContractError`，保留
  `code/message/httpStatus/requestId/data/errors` 的明确类型。
- [x] 2.2 实现纯 envelope parser：校验必填已知字段、success/error branch、真实 status 一致性，忽略
  additive unknown fields，并拒绝裸 payload。
- [x] 2.3 将 request helper 切换到 strict parser；HTTP 200 business rejection 与有效非 2xx error
  均抛 `MistApiError`，malformed/non-JSON response 抛 `MistApiContractError`。
- [x] 2.4 增加显式 no-content helper；204 不解析 JSON，data-returning helper 收到 204 时 fail closed，
  并覆盖 `X-Request-Id` 诊断信息。
- [x] 2.5 更新 API client/fixture tests，覆盖 200/201 success、business 200、400/502/500、status
  mismatch、missing field、bare payload、invalid JSON、additive field 和 204；不得修改 React 页面或组件。

## 3. mist-skills Strict Consumer

- [x] 3.1 将 `MistApiError.error_code` 迁移为 `code: str` 与 `http_status: int`，保留安全
  `message/request_id/data/errors`，并新增 `MistApiContractError`。
- [x] 3.2 重写 `MistClient` response parser：校验真实 status、统一 envelope 和 branch，拒绝裸/non-JSON
  payload，并保持 connection/timeout 为 `MistConnectionError`。
- [x] 3.3 为 Python client 增加显式 no-content operation；204 不解析 JSON，data helper 收到 204 时
  fail closed，并暴露 response-header request id。
- [x] 3.4 将 `shared/kline_runner.py` 从数字 HTTP status allowlist 改为任务 1.4 的 stable-code
  allowlist；增加相同 HTTP status、不同 code 不触发采集的负向测试。
- [x] 3.5 将 `shared/script_runner.py` 与相关 shared tests 机械迁移为显示/断言字符串 code；具体 Skills
  脚本输出与业务行为不得改变。
- [x] 3.6 更新 MistClient contract fixtures，与 frontend 覆盖同一组 success/rejection/technical/
  malformed/additive/204 语义。

## 4. 验收与发布记录

- [x] 4.1 运行 `mist-fe` lint/typecheck/test/build 与仓库既有质量门禁，单独记录自动化通过、环境阻塞
  和未执行项。
- [x] 4.2 运行 `mist-skills` format/lint/typecheck/test 与 repository hygiene 门禁，单独记录自动化
  通过、环境阻塞和未执行项。
- [x] 4.3 全仓检索裸 payload fallback、数字 `error_code`、body `statusCode` 业务分支和 UI/backend 越界
  修改；确认不存在未声明 compatibility branch。
- [x] 4.4 执行本 change、stable specs 与相关 active changes 的 strict validation，以及三个仓库的
  `git diff --check`。
- [x] 4.5 记录发布顺序为 backend boundary 已部署 → `mist-fe`/`mist-skills` 可独立发布；本 change 不
  需要数据库、Redis、交易终端或生产 HIL。

---

## Evidence

### 1.1 前置 change 归档与 backend contract source of truth

- `standardize-service-boundary-contracts` 已归档于 master：
  `openspec/changes/archive/2026-08-03-standardize-service-boundary-contracts/`
  （归档 commit `07e119f`，merge `fe56c68`，实现 `06a042c`；master HEAD `4a61afa`）。
- 归档 spec `specs/service-boundary-contracts/spec.md` 固定 success/error envelope、stable string
  `code`、body `statusCode` 等于真实 HTTP status、HTTP-200 business rejection、204 无 body 但保留
  `X-Request-Id`、`^[A-Z][A-Z0-9_]{0,63}$` public code 校验。
- backend 实现位于 `libs/transport/src/http/`：`api-response.dto.ts`、`api-error.dto.ts`、
  `http-response.interceptor.ts`、`http-exception.filter.ts`、`http-code.ts`（400→`BAD_REQUEST`、
  404→`NOT_FOUND`、500→`INTERNAL_ERROR`、502→`BAD_GATEWAY` 等）、`http-business-rejection.ts`、
  `http-request-context.service.ts`（`http-${randomUUID()}` + `X-Request-Id`）。apps/mist 与 apps/chan
  均通过 `HttpTransportModule` + `installHttpRequestContext` 共享同一 envelope。

### 1.2 跨仓基线（实现前，read-only）

| 仓库 | branch | HEAD | dirty/worktree |
|------|--------|------|----------------|
| mist | `feat/productize-current-day-realtime-market-data` | `917b646` | 在用（并行 change，未触碰） |
| mist-fe | `feat/design-system-phase0` | `6515bfe` | 在用（未触碰） |
| mist-skills | `feat/productize-current-day-realtime-market-data` | `9458f26` | 在用（并行 change，未触碰） |

实现分支 `feat/harden-http-envelope-consumers` 分别从各仓 master 创建独立 worktree：
- mist: `mist/.worktrees/harden-http-envelope-consumers`（master `4a61afa`，仅用于 OpenSpec 记录）
- mist-fe: `.worktrees/harden-http-envelope-consumers/mist-fe`（master `4686f9a`）
- mist-skills: `.worktrees/harden-http-envelope-consumers/mist-skills`（master `3dcd8d1`）

验证命令：
- mist-fe: `pnpm run lint` / `pnpm run typecheck` / `pnpm run test:ci` / `pnpm run build`
- mist-skills: `uv run ruff check .` / `uv run pyright` / `uv run black --check .` / `uv run pytest`

### 1.3 盘点

- mist-fe：旧 `unwrapApiResponse`（`app/api/client.ts`）允许裸 payload（`return payload as T`），仅在
  body 为带 `success` 的对象时解包；非 2xx 只要 body 意外为 `success=true` 仍可能被当成功。仅
  `app/api/client.ts` 内部使用，未导出给 UI；UI 调用方（`StrategiesWorkspace.tsx`、
  `KLineLivePage.tsx`）通过 `error instanceof Error ? error.message` 捕获，故 typed error 继承
  `Error` 即可保持 UI 不变。
- mist-skills：`MistApiError.error_code` 数字语义出现在 `shared/mist_client.py`、
  `shared/kline_runner.py`（`should_collect_after_error`）、`shared/script_runner.py`（CLI 打印）；
  `KLINE_RETRY_STATUS_CODES = frozenset({400, 404})` 在 `shared/api_contracts.py`。无 skill 业务脚本
  直接引用 `error_code/statusCode`（仅经 runner），故仅需机械迁移 shared 层。

### 1.4 K-line 自动采集 stable-code allowlist（不扩大业务范围）

由归档 backend contract 审计（master 真实代码）：
- `POST /v1/indicators/k` 缺证券：`indicator.service.ts` 抛
  `HttpException(INDEX_NOT_FOUND, HttpStatus.BAD_REQUEST)` → HTTP 400 / `code=BAD_REQUEST`。这是
  “需要采集”的信号。
- `GET /v1/securities/:code`、`POST /v1/security-sources`、`POST /v1/collector/collect` 缺证券：
  `NotFoundException` → HTTP 404 / `code=NOT_FOUND`。
- 固定 allowlist：`KLINE_COLLECT_ERROR_CODES = frozenset({"BAD_REQUEST", "NOT_FOUND"})`。
- **不扩大范围**：旧 `{400, 404}` 隐含包含 `VALIDATION_ERROR`（同为 400，DTO 校验失败），
  新 allowlist 显式排除它——请求 shape 错误不应触发采集。`test_kline_runner.py` 新增负向测试
  “same HTTP 400, `VALIDATION_ERROR` 不触发采集”证明相邻 code 不误触发。

### 2 / 3 实现产物

- mist-fe `app/api/client.ts`：`MistApiError<TData>`（extends Error，含
  `code/message/httpStatus/requestId/data/errors`）、`MistApiContractError`（extends Error）、纯
  `parseEnvelope`、`requestJson`（strict）、`requestNoContent`（204 专用）。commit `ddbe494`。
- mist-skills `shared/mist_client.py`：`MistApiError(message, code, http_status, *, request_id, data,
  errors)`、`MistApiContractError`、`parse_envelope`、`MistClient.request_no_content`；
  `shared/api_contracts.py` `KLINE_COLLECT_ERROR_CODES`；`kline_runner.py`/`script_runner.py` 机械迁移。
  commit `ab0907c`。
- 两端 contract fixtures 覆盖同一组：200/201 success、HTTP-200 business rejection、400/500/502
  technical、bare payload、invalid JSON、missing/invalid field、status mismatch、additive field、204。

### 4.1 / 4.2 自动化基线

| 仓库 | 命令 | 结果 |
|------|------|------|
| mist-fe | `pnpm run lint` | 通过（0 error） |
| mist-fe | `pnpm run typecheck` | 通过 |
| mist-fe | `pnpm run test:ci` | 通过（112 tests，含 37 client contract） |
| mist-fe | `pnpm run build` | 通过（Next.js 16 production build） |
| mist-fe | lint-staged（commit 时） | 通过 |
| mist-skills | `uv run ruff check .` | 通过 |
| mist-skills | `uv run pyright` | 0 errors |
| mist-skills | `uv run black --check .` | 通过 |
| mist-skills | `uv run pytest` | 通过（101 tests，含 35 client contract） |

无环境阻塞、无跳过、无未执行项。

### 4.3 残留检索

- 裸 payload fallback：mist-fe `unwrapApiResponse` 已删除（`requestJson` 不再回退裸 payload）；
  mist-skills `_parse_response` 已改为 strict `parse_envelope`。
- 数字 `error_code`：仅余 `test_kline_runner.py` 中测试函数名字面量，非旧属性。
- body `statusCode` 业务分支：两端均改为按 `code` 分支，`httpStatus`/`http_status` 仅诊断。
- UI/backend 越界：未修改任何 React 页面/组件；未修改 mist backend 产品代码、RPC、数据库、部署。

### 4.5 发布顺序

backend boundary 已部署（master `4a61afa` 含 `libs/transport`）→ `mist-fe`/`mist-skills` 可独立发布。
本 change 不需要数据库、Redis、交易终端或生产 HIL；未 push、未归档（待用户确认）。
