# Mist 契约与数据治理指南

状态：Living guide
适用范围：HTTP、RPC、WebSocket、provider adapter、canonical model、持久化、OpenAPI 和跨仓 consumer

## 1. 目的

本指南把多个 stable OpenSpec 中重复出现的契约与数据约束收敛为统一检查入口。它不替代具体 API、
provider 或业务 capability spec。

主要来源包括：`service-boundary-contracts`、`http-envelope-consumers`、
`cross-repo-naming-governance`、`security-code-identity`、`audit-timestamp-contract`、
`database-schema-safety`、`managed-database-column-naming`、`k-line-persistence-integrity`、
`cross-repo-contract-assets`、`datasource-provider-contract` 和 `realtime-market-data-ingress`。

## 2. 四层模型

任何外部数据进入 Mist 时，必须能指出以下四层：

```text
provider-native
  → wire contract
  → Mist canonical/domain model
  → persistence model
```

- provider-native：外部供应商真实字段、单位、时间和结构；
- wire：HTTP/RPC/WS envelope、version、size bound 和 validation；
- canonical/domain：Mist-owned identity、time、quantity、state 与业务语义；
- persistence：MySQL/Redis 的物理字段、精度、nullability、key 和生命周期。

转换只发生在拥有该边界的 adapter。不得让 provider-native 名称渗入 Mist domain，也不得为了表面对称
在 provider 层伪造共同字段。

## 3. 公共契约变更清单

任何 breaking field/path/status 变化必须盘点：

| 层 | 必检项 |
|---|---|
| producer | 类型、真实样本、OpenAPI/schema、negative test |
| wire | envelope、version、status、size/depth/count bound |
| decoder | strict validation、unknown field、missing/invalid semantics |
| state/persistence | canonical field、数据库/Redis、migration、retention |
| consumer | Backend、frontend、Skills、monitoring、deploy、recovery |
| delivery | 匹配版本、feature/mode gate、rollback、HIL |

只修改 producer 或新增兼容 alias 都不构成迁移完成。跨仓 breaking change 必须作为匹配版本组发布。

## 4. 命名、身份和时间

### 4.1 状态名必须带生命周期作用域

必须区分：service health、transport readiness、bridge-owner readiness、subscription state 和 data
freshness。禁止使用脱离对象/方法作用域的 `ready`，也不得把 `transportReady` 当成 `bridge.ready`。

### 4.2 标识符

| 名称 | 含义 |
|---|---|
| `securityCode` | Mist provider-neutral 证券代码 |
| `providerSymbol` | provider 请求或响应使用的证券标识 |
| `source` | Mist 领域中的数据源枚举 |
| `provider` | 外部行情供应商 |
| `datasource` | 独立服务、进程或系统边界 |
| `ownerGeneration` | owner 生命周期代次，不是业务幂等键 |

内部聚合、持久化、查找和订阅跟踪使用 `Security.code`/`Security.id`；provider 调用使用已经配置并
验证的 `providerSymbol`。缺失 provider symbol 时 fail closed，不得退回 canonical code 猜测。

### 4.3 时间

| 名称 | 含义 |
|---|---|
| `eventTime` | canonical 市场事件时间；通常来自 provider，当前 TDX 例外使用 datasource `capturedAt` |
| `capturedAt` | terminal/datasource 捕获时间 |
| `receivedAt` | 当前服务接收时间 |
| `acceptedAt` | 边界验证成功时间 |
| `closedAt` | K 或业务窗口封存时间 |
| `createdAt/updatedAt` | 持久化审计时间 |

缺失 provider `eventTime` 时不得使用 backend 当前时间、`receivedAt` 或 `acceptedAt` 补齐。当前已评审的
TDX realtime runtime 不提供业务时间字段，因此其 source converter 直接使用 schema-v2 decoder 已校验的
datasource `capturedAt`，并忽略 native `AsOf`、`DateTime` 或其他时间别名；该例外不得扩展到 QMT 或其他
provider。受管数据库审计列使用 `created_at/updated_at`，TypeScript/HTTP 使用
`createdAt/updatedAt`；`createdAt` 不随更新变化，审计时间不能替代领域事件时间。Mist TypeORM MySQL
connection 使用显式 `timezone: '+08:00'`，HTTP JSON 序列化为 ISO-8601 instant。

## 5. HTTP、RPC 与 consumer

### 5.1 HTTP

- 公共 HTTP 使用共享 transport envelope，不直接返回 bare business payload。
- body `statusCode` 必须与真实 HTTP status 一致。
- expected business rejection 使用 stable string `code`、safe `message` 和 approved typed `data`；
  transport status 与 domain outcome 分开。
- OpenAPI 描述真实 envelope，不把内部 DTO/entity 当成完整 wire response。
- HTTP 204 只能用于明确声明 no-content 的 operation。
- malformed envelope、server-declared rejection、network failure 必须是三类不同 consumer error。

### 5.2 RPC

- request-response RPC 使用共享的 versioned `RpcRequestV1` / `RpcResultV1` envelope。
- HTTP status/message/OpenAPI 不进入 RPC domain contract。
- unexpected handler error 走 RPC error channel，不能伪装成 domain result。
- `meta.correlationId` 贯穿调用链，但不承担业务幂等。
- one-way event 与 request-response RPC 分开设计。

DTO/VO/Entity/domain contract 的命名和文件布局见
[Mist Backend 代码风格指南](../mist-backend-code-style-guide.md)。

## 6. Provider 与 realtime 边界

- datasource product API 按已批准的 provider-neutral endpoint family 组织；unsupported capability
  返回稳定、明确的错误。
- raw provider call 只用于诊断、smoke 或临时开发，不成为普通业务 API。
- 交易、账户、下单和撤单不混入 market datasource。
- provider history 与 realtime callback 是不同契约，不用字段相似性证明语义相同。
- realtime wire 保留 bounded provider-native map，由 Backend source-specific converter 生成 canonical
  snapshot；公共 decoder 不猜 provider 字段 alias。
- 一个已验证 frame 在每个 process boundary 只 parse/validate 一次，不逐字段重复重建。
- `latest-state snapshot` 不等于 tick-complete event stream，也不自动提供 exactly-once/ordering contract。

## 7. 缺失值、数值和精度

### 7.1 通用规则

- missing、blank、non-numeric、`NaN` 和 `Infinity` 不得伪装成有效零。
- 显式数字 `0` 是有效观察。
- 必填数据非法时 fail closed；非空批次不得静默过滤坏行后返回部分成功。
- `NaN` 只允许作为进程内 sentinel，不能跨 JSON、Redis、TypeORM 或 MySQL。

### 7.2 K 与 quantity

- OHLC 保持 MySQL `DECIMAL(20,2) NOT NULL`，writer 在持久化前验证 finite。
- `volume/amount` 使用 nullable exact `DECIMAL(36,8)`，应用侧使用 canonical decimal string 或 `null`。
- 任何不能在批准 precision 内无损表达的值都要在边界拒绝，不允许浮点强转、取整或补零。
- provider unit 到 canonical unit 的换算由 owning adapter 按真实样本和已批准 profile 执行。
- raw fact 不因消费层需要而被 forward-fill；允许的 projection 必须是只读、有限、同组且由 owning
  spec 明确。

## 8. 数据库和 migration

- 所有 NestJS app 显式 `synchronize: false`。
- 已应用 migration 保持 byte-identical；新 schema 变化只新增 forward-only migration。
- TypeScript 属性可 camelCase，Mist-managed MySQL 物理列必须 lowercase `snake_case` 且显式映射。
- entity metadata、migration、raw SQL、schema audit 和精确 constraint test 使用完全相同的物理名称。
- destructive change 先审计目标数据库：表/列存在性、DDL、行数、NULL/重复分布、FK/index/constraint、
  consumer 和备份。
- 不建立 alias、view、dual-write 或 fallback read，除非 owning change 已逐项批准。
- migration 发布包含 preflight、backup、apply、postflight、readback 和 repair-forward；rollback 说明必须
  与 schema 兼容性一致。

## 9. 跨仓契约资产

- canonical fixture 由 owning repository 维护；consumer repository 保存可离线测试的 pinned copy。
- pinned copy 使用标准 `.sha256` sidecar 检查内容一致性。
- fixture 放在语义明确的测试资产目录，不建立含义模糊的顶层 contract 杂物箱。
- asset 路径迁移不改变 runtime contract；归档 OpenSpec 中的历史路径和 evidence 不追溯改写。
- generated OpenAPI、schema 和 fixture 的变化必须进入 code review，不能只依赖本机重新生成。

## 10. 审查清单

- [ ] 已画出 provider-native → wire → canonical → persistence → consumer。
- [ ] breaking field 的 producer/consumer/deploy/monitoring/recovery 已完整盘点。
- [ ] HTTP status、business code 和 RPC result 没有混用。
- [ ] identity、time、readiness 使用明确作用域词汇。
- [ ] missing 与零、raw 与 effective、historical 与 realtime 没有混淆。
- [ ] 数值在 wire/Redis/MySQL 边界保持 exact 或明确拒绝。
- [ ] migration forward-only，entity/raw SQL/audit/test 同步。
- [ ] 没有新增未经批准的 alias、dual write、fallback 或 partial success。
- [ ] OpenAPI、fixture、`.sha256` 和 negative tests 已同步。
- [ ] 跨仓 breaking change 有匹配版本、发布顺序、HIL 与 rollback/repair-forward。
