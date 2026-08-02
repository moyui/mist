# Mist Backend 代码风格指南

状态：Living guide

适用范围：`mist` 仓库内所有 NestJS applications 与 `libs/*`

适用对象：开发者、审查者和参与 Mist Backend 开发的 AI

## 1. 目的

本指南记录 Mist Backend 的项目级代码风格。它约束新代码和被实质修改的代码，避免同一种边界模型
同时出现 `Dto`、`DTO`、`Request`、`Payload`、`Vo`、`VO`、`Response`、`ViewModel` 等不一致命名，
也避免直接把 TypeORM entity 当作公共 HTTP 契约，以及新增 MySQL 表时继续产生物理命名分叉。

本指南当前冻结 DTO/VO 与 Mist-managed MySQL 表/约束命名规则，后续确认的 Mist Backend 风格继续
追加到本文件，不分散建立相互冲突的零散约定。

本指南与以下文档共同使用：

- `docs/project-quality-governance-guide.md`：项目质量、公共契约、数据库和发布门禁；
- `docs/backend-error-handling-governance-guide.md`：后端错误分类、传播和安全出口；
- stable OpenSpec 与已确认的 active change：具体业务语义和公共契约。

出现冲突时，stable OpenSpec、已确认的 active change、已应用 migration 和当前生产契约优先。本指南
不授权未经评审的公共接口破坏性重命名或批量兼容改造。

## 2. DTO 规则

DTO（Data Transfer Object）用于接收或描述传输边界数据，例如 HTTP body、query、path 参数以及
通用 HTTP transport envelope。

DTO 必须遵循：

- TypeScript class 名称使用 PascalCase，并以 `Dto` 结尾；
- 文件名使用 kebab-case，并以 `.dto.ts` 结尾；
- HTTP 业务模块中的 DTO 放在对应模块的 `dto/` 目录；
- class-validator、class-transformer 和请求侧 Swagger metadata 放在 DTO；
- DTO 只负责边界结构和校验，不执行数据库查询、业务计算或状态推进；
- 不使用全大写后缀 `DTO`，也不使用无后缀的 `Request`、`Params` 或 `Payload` 代替已明确属于
  DTO 的模型。

示例：

```text
apps/mist/src/strategy/dto/create-backtest-run.dto.ts
└── CreateBacktestRunDto

apps/mist/src/strategy/dto/backtest-run-id-param.dto.ts
└── BacktestRunIdParamDto
```

通用 HTTP envelope 属于 transport DTO，可以使用：

```ts
ApiResponseDto<BacktestRunVo>
ApiErrorDto
```

RPC pattern、versioned command、result union 和 event contract 使用其各自的版本化 contract 命名，
不因为它们经过网络传输就机械追加 `Dto`。

## 3. VO 规则

VO（View Object）用于描述公共 HTTP API 返回给消费者的业务视图数据。VO 与持久化 entity、内部
domain model 和通用 HTTP envelope 分离。

VO 必须遵循：

- TypeScript class 名称使用 PascalCase，并以 `Vo` 结尾；
- 文件名使用 kebab-case，并以 `.vo.ts` 结尾；
- HTTP 业务模块中的 VO 放在对应模块的 `vo/` 目录；
- 输出字段、nullability、枚举和响应侧 Swagger metadata 由 VO 明确声明；
- VO 不持有 repository、provider client 或状态修改逻辑；
- controller 不直接返回 TypeORM entity 作为公共契约，应显式映射为 VO；
- 不使用全大写后缀 `VO`，也不使用无后缀的 `Response`、`Result`、`ViewModel` 代替已明确属于
  VO 的模型。

示例：

```text
apps/mist/src/strategy/vo/backtest-run.vo.ts
└── BacktestRunVo

apps/mist/src/chan/vo/bi.vo.ts
├── BiVo
└── BiTwoPhaseVo
```

需要为 Swagger 描述带 envelope 的具体响应时，可以使用以 `Vo` 结尾的业务视图并由通用 DTO 包装，
不得复制另一套 envelope 字段：

```ts
ApiResponseDto<BacktestRunVo>
```

## 4. DTO、VO、Entity 与 Domain Contract 的边界

| 类型 | 主要职责 | 标准命名 | 不得承担 |
|---|---|---|---|
| DTO | 输入校验、传输结构、通用 envelope | `*Dto` / `*.dto.ts` | 数据库查询、业务状态推进 |
| VO | 公共 HTTP 业务输出 | `*Vo` / `*.vo.ts` | ORM 映射、写操作、内部异常对象 |
| Entity | TypeORM persistence model | `*` / `*.entity.ts` | 公共 OpenAPI 单一来源 |
| Domain contract | 跨 app 的业务 command/result/event | 领域名加 `V1` 等版本 | HTTP status、HTTP envelope |

### 4.1 HTTP 查询与内部读取条件不得混名

`QueryDto` 只表示 HTTP query string 的传输与校验模型。内部 library、application service 或 port 的
只读筛选条件不属于 DTO，也不得因为最终会执行数据库查询就机械使用 `QueryDto`、无后缀 `Query`
或 TypeORM `FindOptions` 作为领域契约。

Mist Backend 统一使用：

| 使用场景 | 标准命名 | 说明 |
|---|---|---|
| HTTP query string | `*QueryDto` / `*.query.dto.ts` | 使用 transport validation 和 Swagger metadata |
| HTTP body/path 等输入 | `*Dto` / `*.dto.ts` | 遵循第 2 节 |
| HTTP 业务输出 | `*Vo` / `*.vo.ts` | 遵循第 3 节 |
| 内部只读选择条件 | `*Criteria` / `*.criteria.ts` | 不含 transport decorator 或 ORM 专属类型 |
| 内部状态变更 | `*Command` | 跨进程时使用已批准的版本化 domain contract |
| RPC command payload | `*CommandV1` 等版本化名称 | 不追加 `Dto`，由 `RpcRequestV1<T>` 承载 |
| RPC success data | `*SummaryV1`、`*PageV1`、`*StatusV1` 等语义名称 | 不追加 `Vo`/`Response`，由 `RpcResultV1<T, TCode>` 承载 |
| 内部领域结果 | 按语义使用 `*Page`、`*Window`、`*Observation` 等 | 不追加公共 HTTP `Vo` |

无后缀 `*Query` 只在项目明确采用 query/handler 的 CQRS 语义时使用，不能作为普通 repository
筛选对象的默认后缀。内部 `Criteria` 只描述稳定领域选择条件，不暴露 TypeORM operator、relation、
column metadata、SQL 片段或数据库默认值。

示例：

```ts
interface StrategyReplayPageCriteria {
  securityId: number;
  source: DataSource;
  period: Period;
  startAt: Date;
  endAt: Date;
  afterTimestamp?: Date;
  limit: number;
}

interface StrategyMarketDataPort {
  readReplayPage(
    criteria: StrategyReplayPageCriteria,
  ): Promise<StrategyReplayPage>;
}
```

这里的 `StrategyReplayPageCriteria` 和 `StrategyReplayPage` 是进程内 domain/application 类型，不经过
Controller、OpenAPI 或 HTTP envelope。对外 signals query 仍使用
`BacktestSignalResultQueryDto → BacktestSignalResultPageVo`。

推荐边界：

```text
HTTP request
  → Dto validation
  → application/domain operation
  → Entity/domain result
  → explicit Vo mapping
  → ApiResponseDto<Vo>
```

DTO 和 VO 可以复用领域 enum 或纯类型，但不得为了省一次映射而让公共 HTTP 契约直接依赖 TypeORM
relation、column metadata 或数据库默认值。

### 4.2 RPC input/output 使用版本化领域语义，不使用 HTTP 后缀

RPC contract 分为 shared envelope 与 domain data 两层。外层由 `@app/transport/rpc` 固定，业务模块
不得复制或改名：

```ts
RpcRequestV1<TCommand>
RpcResultV1<TData, TErrorCode>
```

domain data 统一遵循：

- 发起状态变更或执行动作的 input 使用动词开头的 `*CommandV1`，例如
  `SubmitBacktestRunCommandV1`；不得使用 `*InputV1`、`*PayloadV1`、`*RequestV1` 或 HTTP
  `*Dto`；
- success output 不机械使用统一的 `*OutputV1`、`*ResponseV1`、`*Vo` 或 `*ResultV1`，而应选择能
  表达 data 含义的版本化名词：
  - 聚合计数或执行摘要使用 `*SummaryV1`；
  - 分页集合使用 `*PageV1`；
  - 生命周期状态使用 `*StatusV1`；
  - 单个资源详情使用 `*DetailV1`；
  - 仅表示 command 已被接受时使用 `*ReceiptV1`；
- `Result` 已由外层 `RpcResultV1` 表达。只有 `result` 本身是已确认的领域名且没有更准确语义时，
  才允许 domain data 使用 `*ResultV1`，并需在 owning OpenSpec 中说明，避免
  `RpcResultV1<SomethingResultV1, ...>` 的双重含义；
- expected domain rejection code union 使用 `*ErrorCodeV1`；非预期异常继续走 shared RPC error
  channel，不新增 `*ErrorResponseV1`；
- `V1` 是 wire contract version，放在 domain type 名称末尾。pattern 自身已经带 `.v1` 时，payload
  不再增加 `contractVersion` 字段；
- one-way event 不使用 `CommandV1` 或 `RpcResultV1`，必须按单独评审的 `*EventV1` contract 处理。

示例：

```ts
type Request = RpcRequestV1<SubmitBacktestRunCommandV1>;
type Result = RpcResultV1<null, SubmitBacktestRunErrorCodeV1>;
```

公共 HTTP adapter 仍须显式完成 `CreateBacktestRunDto → SubmitBacktestRunCommandV1` 映射；
`apps/backtest` 只接收持久化 `runId`，不接收公共 DTO。RPC domain type 不直接携带 Swagger、
class-validator、HTTP status、message、requestId 或 TypeORM metadata。

### 4.3 HTTP status 与业务 code 分层

新建或实质重构的 Mist Backend HTTP 接口统一区分 transport/protocol outcome 与 expected business
outcome：

- `statusCode` 永远镜像真实 HTTP response status；不得实际返回 200，却在 body 中写伪造的
  `statusCode: 404/409/500`；
- 请求正常进入业务并得到可识别拒绝时，实际 HTTP status 保持 `200`，body 使用
  `success=false`、稳定字符串 `code`、安全 `message` 和经批准的 typed `data`；
- DTO/contract validation、认证、权限和 route 不存在继续使用真实 `400/401/403/404`；
- gateway/RPC dependency failure、service unavailable、deadline 和 unknown internal failure 继续使用
  真实 `502/503/504/500`；
- `code` 用于程序分支，`message` 用于安全可读信息；不得继续把 code 塞进 `message`，也不得用 HTTP
  数字代替可扩展的领域字符串 code；
- HTTP adapter 使用同一个 generic primitive 映射本地 application outcome 或
  `RpcResultV1.error.code` 的 expected business rejection；RPC domain contract 不能包含 HTTP status
  或 HTTP envelope 字段。

示例：

```json
{
  "success": false,
  "statusCode": 200,
  "code": "STRATEGY_NOT_FOUND",
  "message": "策略不存在",
  "data": { "strategyDefinitionId": 123 },
  "timestamp": "...",
  "requestId": "..."
}
```

本规则只约束新建和被实质重构的接口，不授权在没有 OpenSpec、consumer audit 和 migration plan 时
批量改变现有公共 API。

## 5. 文件与导出规则

- 文件 basename 应描述其中主要导出，例如 `backtest-run.vo.ts` 的主要导出为 `BacktestRunVo`；
- 同一文件可以包含紧密相关的组合 VO，但不得成为无关响应模型的集合文件；
- barrel export 必须保持 DTO、VO、entity 和 domain contract 的边界可见；
- DTO/VO 重命名时必须同步 controller、Swagger/OpenAPI、测试、consumer 类型和文档；
- 跨仓 consumer 不直接复制未经 OpenAPI 或契约验证的字段定义。

## 6. Mist-managed MySQL 表与约束命名

本节适用于由 Mist TypeORM entity 和 repository migration 共同管理的业务表。migration runner、
MySQL 系统表和第三方组件自行管理的表遵循其 owner 契约，不因本节机械重命名。

### 6.1 表名

新增 Mist-managed 业务表必须遵循：

- 物理表名使用小写复数名词和 `snake_case`，例如 `strategy_versions`、`backtest_runs` 和
  `backtest_signal_results`；
- TypeORM entity 必须显式声明 `@Entity({ name: '<physical_table_name>' })`，不得依赖 TypeORM
  默认类名转换、自动 pluralization 或全局 naming strategy 猜测物理表名；
- entity metadata 与 forward-only migration 中的物理表名必须完全一致；
- provider 扩展表使用 `<base>_extensions_<provider>`，例如 `k_extensions_ef`、
  `k_extensions_tdx` 和 `k_extensions_qmt`；
- 表名表达稳定领域数据，不写入临时 app 名、进程名、部署环境、版本号或实现阶段；
- 当前核心历史表 `k` 是明确保留的命名例外，不为了统一复数形式创建重命名 migration。

示例：

```ts
@Entity({ name: 'backtest_signal_results' })
export class BacktestSignalResult {}
```

```sql
CREATE TABLE `backtest_signal_results` (...);
```

物理列继续遵循 `managed-database-column-naming` stable spec：TypeScript 属性可以使用 camelCase，
但 Mist-managed MySQL 列必须使用显式映射后的 lowercase `snake_case`。

### 6.2 索引与约束名

Mist-managed 索引和约束使用 lowercase `snake_case`，并按职责使用稳定前缀：

| 对象 | 命名格式 | 示例 |
|---|---|---|
| 普通索引 | `idx_<table>_<purpose>` | `idx_backtest_runs_status` |
| 唯一键 | `uq_<table>_<purpose>` | `uq_backtest_signal_results_run_security_time` |
| 外键 | `fk_<table>_<purpose>` | `fk_backtest_signal_results_run` |
| CHECK | `chk_<table>_<purpose>` | `chk_strategy_definitions_enabled_version` |

`<purpose>` 应表达稳定的业务列组或约束含义，不使用自动生成 hash、临时任务名或含义不明的编号。
entity metadata、migration、schema audit 和精确约束错误测试必须引用同一个名称。

### 6.3 现有表与重命名门禁

- 本节约束新表和被实质修改的表，不授权批量重命名已有生产表；
- 发现现有表名不符合新规则时，先记录为历史例外或技术债，不得只修改 `@Entity`；
- 任何物理表重命名都属于数据库公共契约变更，必须先更新 OpenSpec，审计生产
  `information_schema`、行数、FK/index/constraint 和全部 consumer；
- 经批准的重命名必须使用新增 forward-only migration，并同步 entity、raw SQL、审计脚本、部署
  顺序、备份、readback 和 repair-forward 方案；
- 不建立旧表名 alias、view、双写或运行时 fallback，除非 owning change 逐项批准。

## 7. 现有代码与迁移规则

本指南生效后：

- 新增 DTO/VO 必须符合本指南；
- 新增 Mist-managed 表、索引和约束必须符合第 6 节；
- 被实质修改的 DTO/VO 应在当前 change 范围内对齐；
- 现有不一致属于技术债，不因本指南建立而自动批量重命名；
- 可能影响 HTTP JSON、OpenAPI schema name、跨仓 import 或消费者的重命名，必须先更新 OpenSpec
  并完成影响检查；
- 不保留 `DTO`/`VO` 大写后缀兼容别名，也不为纯类名变化增加双份模型。

例如 provider-native response interface 即使历史名称带 `Vo`，也不能据此把 provider adapter 输入
误当作公共 HTTP VO；其职责应在相关模块被实质修改时单独校对。

## 8. 审查清单

- [ ] DTO class 以 `Dto` 结尾，文件以 `.dto.ts` 结尾。
- [ ] VO class 以 `Vo` 结尾，文件以 `.vo.ts` 结尾。
- [ ] DTO/VO 分别位于职责明确的 `dto/`、`vo/` 目录。
- [ ] controller 没有直接把 TypeORM entity 暴露为公共契约。
- [ ] DTO 只做边界结构与校验，VO 只表达输出视图。
- [ ] 通用 HTTP envelope 没有在业务模块重复定义。
- [ ] RPC/domain contract 没有混入 HTTP DTO/VO 语义。
- [ ] RPC action input 使用 `*CommandV1`，success data 使用准确的版本化语义名称，没有机械使用
  `Input/Output/Request/Response/Dto/Vo` 或与 `RpcResultV1` 重复的 `Result`。
- [ ] RPC expected rejection 使用 `*ErrorCodeV1`，非预期异常继续走 shared error channel。
- [ ] HTTP body `statusCode` 镜像真实 status；expected business rejection 使用实际 200 +
  `success=false/code/message`，protocol/dependency/internal failure 使用真实 4xx/5xx。
- [ ] HTTP query string 使用 `QueryDto`；内部只读筛选使用 `Criteria`，没有混入 transport decorator
  或 TypeORM 专属类型。
- [ ] 内部领域结果按 `Page`、`Window`、`Observation` 等职责命名，没有误用公共 HTTP `Vo`。
- [ ] 重命名已同步 OpenAPI、测试、barrel export 和跨仓 consumer。
- [ ] 新增业务表使用 lowercase plural `snake_case`，并由 `@Entity({ name })` 显式声明。
- [ ] entity、forward-only migration、raw SQL 和 schema audit 使用完全相同的物理表名。
- [ ] provider 扩展表和 `k` 历史例外符合第 6 节，没有制造兼容别名或无依据重命名。
- [ ] 索引、unique、FK 和 CHECK 使用规定前缀，并在 entity、migration 与测试中保持同名。
- [ ] 物理表重命名已经过 OpenSpec、生产 schema 审计、备份和 repair-forward 评审。
- [ ] 公共 breaking change 已进入 OpenSpec 并经过逐项确认。
