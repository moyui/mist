# Mist 后端错误处理常驻治理指南

状态：Living guide

适用范围：`mist` 仓库中的 NestJS applications、共享 libraries、HTTP API、内部 RPC、后台任务、
实时数据消费和 TypeORM/MySQL 访问

适用对象：开发者、审查者、运维人员和参与 Mist 后端开发的 AI

## 1. 目的

本指南统一 Mist 后端新功能的错误分类、传播和出口边界，避免以下问题：

- 每个 TypeORM 查询自行捕获、包装或重试，导致原始原因丢失；
- 把“查询成功但没有结果”误判成数据库故障；
- 把未知数据库错误伪装成业务冲突、队列满或服务未就绪；
- HTTP、RPC、后台任务和实时消费各自发明不兼容的错误结构；
- 向客户端、RPC 调用方或持久化记录泄漏 SQL、driver message、stack、凭据或内部对象；
- 一个实时帧或一个后台任务失败导致长期运行的消费进程整体退出；
- 为避免进程退出而静默吞掉异常，使任务、健康状态和监控继续显示成功；
- 在没有明确所有者、上限和验收条件时增加重试、降级或自动恢复。

本指南适用于新开发和被实质修改的代码。现有代码与本指南不一致时，应记录为技术债或由相关
OpenSpec change 修正；本指南本身不授权顺手改变已有公共契约、状态码或失败语义。

## 2. 规范优先级与相关文档

出现冲突时，按以下顺序判断：

1. 当前 stable OpenSpec 和已经逐项确认的 active OpenSpec change；
2. 已应用的 forward-only database migration、当前生产 schema 和真实运行证据；
3. 当前分支真实代码、测试、OpenAPI、部署和监控契约；
4. 本指南；
5. 历史审计、归档 change、旧设计稿和聊天记录。

本指南与以下文档共同使用：

- `docs/project-quality-governance-guide.md`：项目级质量、数据链路、数据库和发布门禁；
- `standardize-service-boundary-contracts` change：HTTP/RPC 公共 envelope、request identity 和
  transport owner；
- 具体业务 change：定义其领域错误码、幂等语义、空结果、部分结果、超时和恢复策略。

不得因为本指南建议统一错误处理，就在没有 OpenSpec 的情况下破坏现有 HTTP、RPC、OpenAPI、
数据库或跨仓消费者契约。

## 3. 后端错误的六类来源

Mist 后端内部按来源分为六类。分类用于确定所有者、日志、监控和出口，不要求建立六套异常基类。

| 类别 | 含义 | 典型例子 | 通常出口 |
|---|---|---|---|
| 请求契约错误 | 调用方提交的结构、字段或参数不合法 | DTO 校验失败、非法日期、不支持的 period、规则字段非法 | HTTP `400`；RPC strict validation error |
| 业务资源或状态错误 | 查询成功，但业务对象不存在、状态不允许或发生已知竞争 | resource not found、版本缺失、状态冲突、精确幂等冲突 | 新建/重构接口通常为 HTTP `200` + stable business code，或明确的幂等成功 |
| 外部依赖错误 | Mist 调用的 provider、datasource 或其他服务失败 | TDX/QMT 请求失败、响应结构非法、依赖不可用 | HTTP `502/503` 或 owning task failure |
| 数据库或持久化错误 | TypeORM/MySQL 执行、连接、事务或未知约束失败 | `QueryFailedError`、连接断开、事务提交失败 | 安全的内部错误；HTTP 通常为 `500` |
| 内部数据或程序错误 | Mist-owned 数据不满足不变量或代码出现未预期错误 | 非法 K 精度、非法状态、计算前置条件破坏、普通 `Error` | 安全的内部错误；HTTP 通常为 `500` |
| 运行时或生命周期错误 | 长期运行链路、任务或进程在其生命周期边界失败 | 实时帧拒绝、Redis 封存失败、run 执行失败、启动配置非法 | 由实时、任务或启动边界处理 |

对 HTTP 消费者，上述六类压缩为三组，但 HTTP status 与业务 outcome 不混用：

1. 请求未满足 HTTP contract、认证或路由要求：真实 `4xx`；
2. 已经正常进入业务并得到可识别拒绝：真实 `200`，body `success=false` 且携带稳定 business
   `code`；
3. 外部依赖、超时、Mist 自身、数据库或未知异常：真实 `5xx`。

内部日志和监控不得只记录这三组 HTTP 结果，必须保留足以区分六类来源的上下文。

## 4. 成功结果不是异常

以下 TypeORM 结果本身不属于数据库错误：

- `findOne()` / `findOneBy()` 返回 `null`；
- `find()` 返回空数组；
- `update()` / `delete()` 的 `affected` 为 `0`；
- 条件领取、条件状态转换或幂等写入没有命中目标行。

业务 owner 必须解释这些成功结果：

| 成功结果 | 可选业务解释 |
|---|---|
| 必须存在的单个资源返回 `null` | 领域 not-found；新建/重构 HTTP adapter 通常映射为实际 `200 + success=false + code` |
| 可选资源返回 `null` | 正常的 `null` |
| 列表查询返回 `[]` | 正常空集合 |
| 计算所需历史数据为空 | 按 owning spec 定义为合法零结果或明确失败 |
| 条件更新 `affected=0` | 未找到、并发状态变化、未领取或幂等 no-op |

不得仅因为结果为空就抛出 `DATABASE_QUERY_FAILED`。是否允许空结果、部分结果或零结果属于业务
语义，必须在相关 change 中确认。

## 5. 分层传播边界

### 5.1 Repository 和持久化 helper

Repository、query helper 和低层 persistence utility：

- 返回 TypeORM 的正常查询结果；
- 不把 `null`、`[]` 或 `affected=0` 自动转换为 HTTP/RPC 异常；
- 不建立通用 `catch (QueryFailedError)` 包装器；
- 不在每次查询内自动重试；
- 不依赖 HTTP status、HTTP response DTO 或 RPC error code；
- 除精确、已确认的数据库约束识别外，让异常继续向上。

允许共享“识别 MySQL 错误事实”的小型 utility，例如识别 driver code 和精确 constraint name；
该 utility 不得决定业务含义、HTTP status、RPC code、重试或恢复动作。

### 5.2 Application / use-case service

Application service 负责解释成功结果和业务不变量：

- 必须存在的资源缺失转换为领域 not-found outcome，不直接决定 HTTP `404`；
- 状态不允许转换为领域 conflict/rejection outcome，不直接决定 HTTP `409`；
- 已确认的幂等结果可以转换为 no-op success；
- 多表共同维护一个业务不变量时使用 TypeORM transaction；
- transaction 内不捕获未知错误以伪造部分成功；
- 可复用的 domain library 不编码 HTTP status，HTTP/RPC adapter 分别映射。

### 5.3 HTTP 边界

HTTP controller、interceptor 和 exception filter 共同负责：

- 返回真实 HTTP status，body 中的 `statusCode` 必须一致；
- `ApiError.code` 表达稳定业务或技术错误分类，`message` 表达安全可读信息，二者不得继续混为一个
  字段；
- 复用当前请求唯一的 `requestId`，不得在成功和失败路径生成两个无关 identity；
- 只暴露稳定 error code、安全 message 和已批准的 typed data；
- validation 字段错误进入约定的 validation details 字段；
- 未知异常不得暴露 stack、SQL、driver message 或任意内部对象；
- `QueryFailedError` 默认映射为通用数据库内部错误；
- 只有业务 owner 明确批准的错误才能映射为 `4xx`、`502` 或 `503`。

RPC 业务 code、真实 HTTP status 和 HTTP body 的 `statusCode` 是三个不同职责，adapter 必须显式
连接它们：

1. domain owner 在 `RpcResultV1.error.code` 定义稳定业务语义，不在 RPC contract 中编码 HTTP；
2. HTTP adapter 将本地 application outcome 或 RPC result 中已批准的 expected domain rejection
   映射为同一个 business-error envelope，并保持真实 HTTP status `200`；请求契约、权限、路由、
   dependency 和 unexpected outcome 使用各自真实 `4xx/5xx`；
3. HTTP exception filter 从 response object 读取该真实 status，并原样写入 `ApiError.statusCode`。

例如 expected `STRATEGY_NOT_FOUND` 可以返回实际 `200 OK`、body `success=false`、
`statusCode=200`、`code=STRATEGY_NOT_FOUND` 和安全 message/data。禁止实际 HTTP 200，却把 body
`statusCode` 伪造成 `404/409/500`；若需要保留数字业务码，字段必须另名为 `businessCode`，不能冒充
HTTP status。HTTP consumer 先按真实 status 判断链路/协议，再按 `success/code` 判断业务 outcome。

### 5.4 RPC 边界

内部 RPC：

- 使用 `libs/transport/rpc` 定义的公共 envelope；
- pattern、payload 和业务 error-code union 由对应 domain owner 定义；
- strict validation failure 和未预期异常走 Nest RPC error channel；
- 不得把数据库错误伪造成 `queue_full`、`not_ready`、`not_pending` 等业务拒绝；
- `correlationId` 用于跨进程观测，不自动承担业务幂等；
- handler 只返回已经确认的业务结果，不返回 stack、driver error 或任意异常对象。

### 5.5 后台任务边界

异常应穿透低层代码，到达单个任务或 run 的最外层边界。任务边界：

- 隔离当前任务失败，不能因一个任务失败永久终止整个 worker；
- 记录 task/run identity、correlation、阶段和原始异常；
- 按 owning spec 尝试一次必要的 FAILED 状态收口和资源清理；
- 收口数据库操作再次失败时，不递归重试或伪造成功；
- 同时保留原始执行错误和收口错误，后者不得覆盖前者；
- 没有明确 retry owner、幂等证明、上限和验收条件时，不自动重跑业务任务。

“异常向最上层抛出”是指抛到当前任务边界，不是让一个可隔离的任务异常变成未处理 rejection，
从而使整个长期运行进程退出。

### 5.6 实时消费边界

WebSocket、snapshot ingress 和实时 candle 等长期运行链路：

- 单个非法 frame、contract mismatch 或 provider value 不应终止整个消费循环；
- 在 decoder/converter 边界 fail closed，记录稳定 reject reason 和必要 identity；
- 不把缺失或非法值静默补成 `0`、空字符串或当前时间；
- state/persistence 失败按 owning spec 标记 invalid、discarded、degraded 或失败；
- 不得在 catch 后继续把该条数据当成成功；
- 必须通过 diagnostics、metrics 或日志使持续拒绝和持久化失败可观测。

### 5.7 启动边界

环境变量非法、必要 provider 未注册、数据库 schema 不兼容或关键依赖无法初始化时：

- 应在启动或 readiness gate 明确失败；
- 不使用隐式默认值绕过非法显式配置；
- 不把未完成初始化的服务声明为 ready；
- 启动失败日志必须指出配置名或组件，但不得泄漏凭据。

## 6. TypeORM 和 MySQL 专项规则

### 6.1 默认传播

未知的 TypeORM/MySQL 异常默认继续向上，不在 repository 或普通 service 中反复 catch、改名和重抛。
HTTP 最终使用安全的通用数据库错误；RPC 和任务边界使用各自的内部失败出口。

### 6.2 精确约束冲突

只有同时满足以下条件，数据库异常才可以转为业务结果：

1. 确认为 duplicate/constraint violation；
2. 精确匹配预期 constraint name，不能只判断所有 `ER_DUP_ENTRY`；
3. 相关 stable spec 或 active change 已定义其业务含义；
4. 负向测试证明其他 unique、FK、NULL、类型和 SQL 错误仍会向上抛。

已知冲突的业务含义只能是 owning domain 已确认的一种：

- 幂等成功；
- 明确的领域 conflict/rejection，由 HTTP adapter 按 owning contract 映射；
- 当前任务内跳过已经存在的相同结果。

不得根据 SQL message 的模糊字段片段猜测业务约束。

### 6.3 条件更新和 readback

`UPDATE ... WHERE id=? AND status=?` 的 `affected=0` 是并发状态结果，不是查询失败。只有当调用方必须
区分“已经被领取/完成”和“仍可失败”时，才允许执行一次必要 readback。

readback 是状态机正确性的一部分，不是通用纠错机制。readback 自身失败时，异常直接进入当前
HTTP、RPC 或任务边界，不继续推测状态。

### 6.4 事务边界

满足以下任一条件时，应评估 TypeORM transaction：

- 多表写入必须共同成功；
- 状态推进和对应不可变结果必须原子提交；
- 失败后的部分写入会被正常消费者误认为完成。

不得为了追求“任何错误都能回滚”而把长时间计算、provider 请求、RPC 等待或整轮历史回放放进
长事务。外部调用应在事务之外，数据库内只保持必要的短原子区间。

### 6.5 查询资源边界

错误传播不能替代资源限制。所有可能增长的查询必须同时定义：

- 确定且稳定的排序；
- page/cursor 大小上限；
- 总行数、时间范围或 run deadline；
- worker concurrency 与数据库连接池预算；
- 跨页读取的一致性要求；
- 中断后的清理和部分结果语义。

禁止在新代码中使用无界 `.find()` 加载可持续增长的 Signal、AlertEvent、K 或 backtest result。

### 6.6 重试和超时

- 普通 repository/service 不自动重试数据库查询；
- 只有 owning change 明确了错误类别、幂等、次数、退避、deadline 和监控后，最外层 orchestrator
  才可以重试；
- “不重试”不等于允许永久挂起：连接、RPC、外部请求和整轮任务必须具有明确 deadline；
- timeout 后不得在不知道前一次是否已提交的情况下直接重复写入；
- 需要判断 lost response 时，优先依靠持久 identity、条件更新和一次必要 readback。

## 7. 外部依赖错误

Provider、datasource 和其他服务边界：

- 非法调用参数属于请求契约错误，不属于 provider unavailable；
- 上游明确拒绝、超时、断连或非法响应通常属于 dependency failure；
- 作为 HTTP gateway 的同步调用通常映射为 `502 Bad Gateway`；
- 已知依赖暂时未就绪且调用方稍后可以重新发起时，才使用 `503 Service Unavailable`；
- fallback、成功空结果、部分成功和降级必须由 owning spec 明确允许；
- 对外 message 不拼接未经清理的 provider body、URL query、token 或 stack；
- 日志保留 provider、operation、correlation 和已清理的上游错误信息。

同类 provider 操作应保持一致映射。现有 provider 之间的不一致需要单独 change 修正，不能作为新
代码的先例。

## 8. 对外状态与错误码

推荐状态边界如下；具体业务 code 由 owning domain 定义：

| HTTP status | 使用条件 |
|---|---|
| `200` | 请求正常进入业务并返回 success，或返回 owning contract 已批准的 expected business rejection；后者必须 `success=false` 并携带 stable `code` |
| `400` | 请求结构、字段或业务输入非法 |
| `401` | 尚未认证 |
| `403` | 已识别调用方无权限访问 |
| `404` | HTTP route/resource path 本身不存在；新建/重构接口中的 expected domain not-found 通常使用 `200 + code` |
| `409` | 非 expected-business-result 的 HTTP protocol/state conflict；新建/重构接口中的普通领域状态拒绝通常使用 `200 + code` |
| `429` | 已明确、可观测且有上限的请求或队列容量拒绝 |
| `502` | 作为 gateway 调用上游时，上游失败或返回非法响应 |
| `503` | 已确认的服务未就绪或暂时不可用 |
| `504` | 已确认的同步 gateway/RPC deadline 到期 |
| `500` | 数据库、内部不变量、程序错误和其他未预期异常 |

禁止仅根据异常类名或“看起来可重试”就把未知错误映射为 `429/502/503`。

公共 envelope、typed error data、requestId/correlationId 和 message 规则由
`standardize-service-boundary-contracts` change 所有。本指南不复制其 TypeScript contract。

## 9. 日志、持久化与可观测性

### 9.1 对外与内部信息分离

对外只返回：

- 稳定 error code；
- 安全、可理解的 message；
- 已批准的 typed data；
- 当前 requestId/correlationId。

内部日志按需要记录：

- application、operation、requestId/correlationId；
- resource/task/run identity；
- provider/source 和执行阶段；
- 原始异常类型、stack；
- 已清理的 driver code、constraint name 或 upstream status。

禁止记录数据库密码、API key、cookie、token、完整 provider 原始敏感 payload 或未经清理的 SQL
参数。

### 9.2 避免重复日志

同一异常应由最了解执行上下文且能够决定最终结果的边界记录一次权威 error log。低层代码如果只
会原样重抛，通常不重复记录；如果必须增加 provider、symbol、run 或阶段信息，应使用结构化上下文，
避免与上层产生多份无法关联的 stack。

### 9.3 失败状态不得保存原始异常

持久化的 `errorMessage`、delivery result 或 context snapshot 不得直接保存原始 SQL、driver
message、stack 或任意异常对象。应保存稳定失败类和经过清理、长度有界的操作说明；完整原始错误只
进入受控日志。

## 10. 当前实现与新代码边界

截至本指南建立时，`apps/mist` 当前 HTTP filter 的行为是：

- `HttpException` 保留 status 和 message；
- `QueryFailedError` 返回 `500` 和通用数据库 message；
- 其他异常返回 `500` 和通用内部错误 message。

当前代码还存在以下历史不一致，不得复制到新功能：

- 部分 provider 使用 `502`，部分普通 `Error` 最终成为 `500`；
- 部分 `message` 被当作 code，部分是人类描述；
- success interceptor 与 exception filter 可能生成不同的 request identity；
- 部分列表和历史 K 查询缺少分页或硬上限；
- 个别任务将原始异常 message 直接保存到数据库；
- 个别低层 catch 记录日志后原样重抛，造成潜在重复日志。

这些问题应由对应 OpenSpec change 和测试修复。本指南不要求在每个新功能 change 中顺手重构所有
历史代码。

## 11. 新功能设计检查清单

### 分类

- [ ] 已标明每个失败属于六类中的哪一类。
- [ ] 已区分异常、成功空结果、部分结果和并发未命中。
- [ ] 已定义哪些是业务拒绝，哪些必须作为内部异常传播。

### TypeORM

- [ ] 没有新增通用 repository catch/retry wrapper。
- [ ] 精确 unique conflict 与其他数据库错误严格区分。
- [ ] 多表不变量有必要的短事务。
- [ ] `affected=0` 和 readback 的业务含义明确。
- [ ] 增长型查询具有 cursor/page、稳定排序、上限和 deadline。
- [ ] 数据库池与 worker concurrency 有明确预算。

### HTTP/RPC

- [ ] HTTP status 与 body `statusCode` 一致。
- [ ] expected business rejection 使用实际 HTTP 200、`success=false` 和 stable `code`，没有在 body
  `statusCode` 伪造 4xx/5xx。
- [ ] RPC domain error code 由 HTTP adapter 显式映射为 business-error envelope，没有把 HTTP 语义
  写回 domain contract。
- [ ] 成功和失败复用同一 requestId。
- [ ] RPC correlationId 可贯穿日志且不冒充业务幂等键。
- [ ] 业务 error code 由 domain owner 定义，共享 transport 不持有业务枚举。
- [ ] 未知数据库或程序异常没有伪装成业务 code。
- [ ] stack、SQL、driver message 和内部对象没有对外泄漏。

### Worker/realtime

- [ ] 单个任务或 frame 失败不会无声成功，也不会无边界杀死长期运行进程。
- [ ] 失败状态、清理、可观测性和后续任务继续执行语义明确。
- [ ] retry、fallback、自动恢复和 readback 都有唯一 owner 与硬上限。
- [ ] “不重试”场景仍有 timeout/deadline 和资源释放。

### 测试

- [ ] 覆盖 DTO/contract validation、not found、conflict 和 empty result。
- [ ] 覆盖精确 constraint conflict 与其他 `QueryFailedError`。
- [ ] 覆盖 dependency timeout、非法响应和安全 message。
- [ ] 覆盖任务失败、收口失败、部分结果和后续任务隔离。
- [ ] 覆盖未知异常 fail closed、request/correlation identity 和无敏感信息泄漏。

## 12. 审查输出建议

涉及错误处理的审查至少记录：

| 项目 | 内容 |
|---|---|
| 来源类别 | 六类中的具体类别 |
| producer | 抛错、返回空值或产生 reject 的位置 |
| propagation | repository → service → HTTP/RPC/task/realtime 边界 |
| public result | status、error code、message、typed data |
| internal evidence | log、metric、task state、diagnostics |
| retry/recovery | owner、次数、deadline、幂等和清理 |
| negative tests | 相邻错误没有被错误分类或泄漏 |

没有真实环境、MySQL、provider 或 Windows HIL 证据时，应明确写为未验证，不得仅凭 mock 断言
生产错误映射已经闭环。
