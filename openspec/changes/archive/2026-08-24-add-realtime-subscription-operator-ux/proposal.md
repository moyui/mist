## Why

生产订阅生命周期的 backend/datasource change 将冻结 assignment、Security status、provider active evidence 和 convergence 的公共契约，但 frontend 实现应由独立仓库、独立分支和独立 AI 交付，避免 UI 工作阻塞生产控制链路。当前 `mist-fe` 也仍含 QMT 旧枚举 `mqmt`，需要一个边界清晰、只消费冻结契约的 operator UX change。

## What Changes

- 在 `mist-fe` 新增可见的 `/settings/realtime-subscriptions` operator page。
- 使用 backend 冻结的 cursor inventory、初始化 POST、单证券 sources lookup 和既有 Security activate/deactivate PUT。
- 分开显示 Security desired、provider active evidence、convergence、deferred removal 与 QMT blocked recovery guidance。
- 使用精确 `tdx|qmt` 枚举、分页无关的 source capacity，并为公共契约保存 pinned fixtures 和 SHA-256 sidecars。
- 不提供 desired PATCH、raw subscribe/unsubscribe/sync、assignment delete、source switch 或 recovery bypass。
- 不修改 `mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring` 的实现或生产生命周期设计。

## Capabilities

### New Capabilities

- `realtime-subscription-operator-ux`: 生产实时订阅 assignment 的初始化、分页状态查看、Security 激活/停用和 provider-specific operator guidance。

### Modified Capabilities

- 无。

## Impact

- `mist-fe`: API types/client、contract fixtures、settings route、可见导航、组件与测试。
- 前置依赖：`integrate-production-realtime-subscription-lifecycle` task 1.4 必须先冻结 OpenAPI、examples、error table 和 fixture digest；backend API 未冻结前本 change 不得自行发明字段。
- 发布：frontend 可单独开发和验证，但只能与匹配的 backend contract/image 组发布；backend lifecycle 不依赖该页面才能运行。
