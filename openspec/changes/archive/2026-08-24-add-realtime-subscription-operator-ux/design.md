## Context

`integrate-production-realtime-subscription-lifecycle` owns MySQL assignment、Security desired authority、provider control、active/effective evidence、monitoring 和发布门禁。本 change 只消费其 task 1.4 冻结的 version-first HTTP/OpenAPI/fixture contract，在 `mist-fe` 提供 operator UX。当前 frontend 通过 `/api/mist` gateway 和共享 envelope client 访问 backend；其 `DataSourceValue` 仍含错误旧值 `mqmt`，而 backend 枚举为 `qmt`。

## Goals / Non-Goals

**Goals:**

- 用一个可见 settings page 完成 assignment 初始化、分页查看和 Security 激活/停用。
- 把 desired、provider active evidence、convergence 和 recovery guidance 分开表达。
- 保持请求、分页、capacity、pending state、nullable 和 contract fixtures 有界且可测试。
- 让 frontend 在独立分支实施，不反向修改 backend lifecycle 设计。

**Non-Goals:**

- 不实现或调用 raw subscribe、unsubscribe、sync、assignment delete、source switch、desired PATCH 或 context-rebuild mutation。
- 不新增 backend endpoint，不扫描全部 Securities，不用 N+1 发现 source config。
- 不修改 backend、datasource、deploy、monitoring、database 或 OpenSpec lifecycle ownership。
- 不把 QMT durable registry 描述为 provider-native active list。

## Decisions

### 1. 冻结 contract 是实施前置门禁

只有 owning change task 1.4 已产出并评审 OpenAPI、examples、expected error table、state table 和 SHA-256 后才开始 frontend。frontend 把批准副本保存到 `__fixtures__/contracts/realtime-subscriptions/`，字段或 digest 不匹配时 fail closed，不自行兼容、重命名或补默认值。

### 2. 复用现有 gateway 与 envelope client

所有请求使用 `/api/mist`：bounded `GET/POST /v1/realtime-subscriptions`、`GET /v1/securities/:code/sources`、`PUT /v1/securities/:code/activate|deactivate`。两个 PUT 成功为 HTTP 200 shared envelope、`data=null`，必须走 data-returning parser，不能使用只接受 204 的 no-content helper。expected business rejection 根据 stable code 展示，network/dependency/malformed envelope 分开处理。

### 3. Existing binding 使用单证券 lookup

operator 输入 canonical Security code 后只查询该 code 的 `/sources`。页面筛出 enabled `tdx|qmt`，把现有字段 `formatCode` 只读标注为 provider symbol；POST 只提交 `securitySourceConfigId`。ACTIVE STOCK、未绑定和容量资格由 backend 权威校验，frontend 不做全库或 N+1 discovery。

### 4. 分页 inventory 不推断全局事实

页面按 `afterId/limit` 显式加载 bounded pages。容量只使用 response 的 `sourceCapacities[{source,activeAssignmentCount,limit}]`，不从当前页行数推断，也不为容量拉取全部页。backend 的 `REALTIME_ACTIVE_CAPACITY_REACHED` 在竞态下仍权威。

### 5. 状态展示保留不同事实层

每行分别显示 Security status/computed desired、`active=true|false|null`、`activeEvidence`、`convergence` 和 bounded reason。`active=null` 不能显示为未订阅；TDX 标为 terminal native-list evidence，QMT 标为 durable registry evidence。deactivation 后 active=true 显示 deferred removal；blocked QMT 只链接/说明批准 runbook，不提供恢复 mutation。

### 6. UI mutation 有单行 pending 与 stale-response fencing

同一 assignment 的 conflicting PUT 在前一请求结束前禁用；成功 POST/PUT 后刷新 bounded current inventory。较旧 response 不得覆盖较新的 page/query/mutation generation。导航必须从现有 operator-visible surface 可达，不能只靠手工 URL。

## Risks / Trade-offs

- [backend contract 尚未冻结] → task 1.4 未完成时暂停，不用本 change 猜 DTO/VO。
- [current frontend 的 `mqmt` 可能影响共享类型消费者] → 改为精确 `qmt`，运行全量 typecheck/tests/build，不增加别名。
- [client capacity 可能在并发下过时] → 仅作交互 guard，backend stable rejection 始终权威，随后 refresh。
- [分页刷新导致位置变化] → 保留 current cursor/page intent，并对 stale response fencing；不以无界全量加载换取稳定。

## Migration Plan

1. 等待 owning change task 1.4 冻结并发布 approved fixtures/digests。
2. 在独立 `mist-fe` 分支复制 fixtures，先实现 client contract tests，再实现 route/components。
3. 运行 frontend lint、typecheck、unit tests、production build，并与匹配 backend contract 做集成验证。
4. frontend 可独立回滚；回滚不得修改 backend assignments、Security status 或 provider subscription lifecycle。

## Open Questions

- 无。任何冻结字段与真实 backend OpenAPI 不一致时暂停并回到 owning lifecycle change 修订，不在 frontend 建兼容层。
