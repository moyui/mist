# Mist 项目质量常驻治理指南

状态：Living guide  
适用范围：`mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring`、`mist-fe`、`mist-skills`  
适用对象：开发者、审查者、运维人员和参与 Mist 开发的 AI  

## 1. 目的

本指南把已经完成的项目质量治理转化为日常开发约束，用于防止后续功能重新引入以下问题：

- 同一个状态名表达多个生命周期阶段；
- provider-native、wire contract、canonical model 和数据库字段互相混用；
- 跨仓字段只修改 producer，没有同步 consumer、部署和监控；
- 缺失数据被静默补成 `0`、空字符串或当前时间；
- TypeScript 属性、数据库物理列、文件名和目录职责持续分叉；
- migration、ORM metadata、运行代码和生产 schema 不一致；
- 未部署、无调用方或已被替代的链路继续被当成正式能力；
- 自动化通过，但真实终端、Windows 会话或生产 HIL 尚未证明。

本指南是日常检查入口，不替代具体功能的 stable OpenSpec、active change、数据库 migration、
provider 官方契约或生产证据。

Mist 的统一规范导航、开发流程和 OpenSpec 提炼映射见
[`governance/README.md`](./governance/README.md) 与
[`governance/development-handbook.md`](./governance/development-handbook.md)。

公共 HTTP/RPC/WS、provider/canonical/persistence 数据边界另外遵循
[`governance/contract-and-data-governance-guide.md`](./governance/contract-and-data-governance-guide.md)。

Realtime、worker、queue、health、metrics、deployment 和 HIL 另外遵循
[`governance/runtime-and-observability-governance-guide.md`](./governance/runtime-and-observability-governance-guide.md)。

Mist 后端的错误分类、TypeORM 异常传播、HTTP/RPC 出口以及 worker/realtime 失败边界，另外遵循
[`backend-error-handling-governance-guide.md`](./backend-error-handling-governance-guide.md)。

Mist Backend 的 DTO、VO、Entity、domain contract 命名与文件组织，另外遵循
[`mist-backend-code-style-guide.md`](./mist-backend-code-style-guide.md)。

## 2. 规范优先级

出现冲突时，按以下顺序判断：

1. 当前 stable OpenSpec 和已确认的 active OpenSpec change；
2. 已应用的 forward-only database migration 与当前生产 schema 证据；
3. 当前分支真实代码、测试、部署脚本和生成契约；
4. 本指南；
5. 历史审计报告、归档 change、旧设计稿和聊天记录。

不得从归档 change 恢复旧字段或旧路径。历史报告中的行号、数量和状态在引用前必须重新验证。

## 3. 开发工作流中的使用方式

### 3.1 开始设计前

1. 记录涉及仓库、branch、HEAD、dirty status 和是否包含 worktree。
2. 查找相关 stable specs、active changes、migration 和生产运行手册。
3. 画出受影响数据的 `producer → wire → decoder → state/persistence → consumer → deploy/monitoring`
   链路。
4. 判断是否触发第 4 节的 OpenSpec 门禁。
5. 对第 5 节列出的讨论项，必须先停下来与用户确认，不得凭命名直觉实施。

### 3.2 实现过程中

1. 每次公共契约修改同步更新 producer、consumer、negative tests、fixture、OpenAPI、脚本和指标。
2. 每次数据库修改使用新增 migration，并同步 ORM metadata、raw SQL、审计脚本和回滚说明。
3. provider-native 差异只在边界层转换，不为追求表面对称而伪造共同字段。
4. 新增集合、队列、缓存、重试或 pending map 时，同时定义容量、超时、清理和失败语义。
5. 删除或移动文件时，全仓检索 import、barrel export、test discovery、Nest/TypeORM 注册和文档引用。

### 3.3 提交前

1. 执行第 10 节的短检查清单。
2. 运行受影响仓库的定向测试、全量静态检查和契约门禁。
3. 检索退役字段、旧路径、兼容别名和无作用域 `ready`。
4. 确认没有把环境失败、跳过项或非交易时段结果描述成代码通过。
5. 更新 active change 的 tasks/evidence；完成后同步 stable specs 并归档。

### 3.4 发布前

1. 固定所有相关仓库和终端 bridge artifact 的 SHA-256。
2. 破坏性跨仓契约必须作为匹配版本组发布，不能新旧混跑。
3. 数据库 migration 必须有 preflight、postflight、readback 和 repair-forward 方案。
4. 需要终端或 Windows 交互桌面的能力必须完成 HIL；CI 不能替代终端证据。
5. 回滚说明必须与 schema 兼容性一致。旧应用不能读取新 schema 时，不得声称只回滚镜像即可。

## 4. 何时必须创建或更新 OpenSpec

出现以下任一情况时，先创建或更新 change，再实施：

- 修改 HTTP、WebSocket、OpenAPI、环境变量、指标或跨仓 JSON path；
- 引入破坏性字段删除、重命名、严格 decoder 或拒绝旧 payload；
- 修改数据库表、列、索引、FK、unique、nullability、precision 或数据所有权；
- 改变 realtime/historical 数据来源、权威性、持久化位置或恢复策略；
- 新增跨进程 owner、leader、generation、retry、dead-letter 或自动恢复语义；
- 改变部署拓扑、终端 bridge、Windows 任务、Compose service 或发布顺序；
- 删除一条曾经可达的业务链路或改变模块职责边界；
- 需要多个仓库原子发布或整体回滚。

以下通常可直接实现，但仍需测试和检索：

- 不改变外部契约的内部重构；
- 已有 stable spec 明确允许的局部实现；
- 单仓私有文件名修正；
- 测试、注释和文档中的非语义性修复。

## 5. 必须停下来讨论的事项

以下事项不能由 AI 或开发者机械决定：

- provider 字段的含义、单位、时间基准、复权口径或缺失语义没有真实样本证明；
- 数据库字段改名、删除、改类型、改精度、改 NULL 规则或补历史数据；
- 两个近义字段是否应合并，例如 previous close、settlement、amount/turnover；
- 是否保留 provenance、审计快照或原始 provider payload；
- 是否允许成功空结果、部分成功、自动重试或降级；
- 是否新增兼容层、别名、双写、回填或新旧版本混跑；
- 是否扩大到新的市场、证券类别、期货、期权或新的 provider；
- 生产真实 schema、存量分布或终端行为与代码推断不一致；
- 删除对象存在业务消费方、外部消费者或生产数据，但所有权不明确。

讨论材料至少包含：当前 producer、consumer、真实样本、数据库分布、候选方案、迁移影响和验证方式。

## 6. 已冻结的防劣化决策

### 6.1 Realtime readiness 分层

必须区分：

| 层级 | 标准表达 |
|---|---|
| 服务存活 | root health `status` |
| WebSocket 已连接 | `connected` |
| 合法 ready 帧已接受 | `transportReady` |
| terminal bridge owner 已就绪 | `bridge.ready` |
| owner 身份 | `bridge.ownerId` |
| owner 生命周期代次 | `bridge.ownerGeneration` |
| bridge 构建身份 | `bridge.bridgeBuildId` |
| 订阅状态 | provider-specific diagnostics |
| 数据新鲜度 | event/snapshot freshness diagnostics |

禁止重新引入：

- `tdxRealtimeBridgeReady`；
- `collectorReady`；
- 无对象或方法作用域的状态 `ready`；
- ready data 顶层 `ownerId`、`generation`；
- 没有可靠生产方的 `datasourceBuildId`；
- 把 `transportReady` 当成 `bridge.ready`。

Bridge 专属 health endpoint 已经具有 bridge 作用域，可以返回顶层 `ready`；aggregate root health
必须使用 `bridge.ready`。

### 6.2 Realtime frame 与 provider 边界

- 当前正式 wire contract 是 schema-v2 native-map frame。
- 公共 decoder 只负责 envelope、provider、时间、map bound 和 provider symbol。
- TDX/QMT converter 分别解释 native 字段，再生成 `CanonicalRealtimeSnapshot`。
- 不建立猜测字段的跨 provider alias table。
- canonical fixture 在四仓保存 pinned copy，并通过 `.sha256` sidecar 校验一致。

TDX realtime previous close 只接受精确 provider-native `LastClose`，然后映射为
`prices.lastClose`。禁止接受 `PreClose`、camelCase `lastClose` 或大小写变体。
QMT 可以从其实际 native `lastClose` 映射到同一个 canonical 输出。

### 6.3 标识符词汇

| 名称 | 含义 |
|---|---|
| `securityCode` | Mist provider-neutral 证券代码 |
| `providerSymbol` | provider 请求或响应使用的证券标识 |
| `source` | Mist 领域中的数据源枚举 |
| `provider` | 外部行情供应商 |
| `datasource` | 独立服务、进程或系统边界 |
| `ownerGeneration` | bridge owner 生命周期代次 |

`SecuritySourceConfig.formatCode` 的 TypeScript 名称暂时保留，但语义固定为权威
`providerSymbol`。启用的 TDX/QMT 配置必须非空并符合各自格式，禁止回退到 `Security.code`。

### 6.4 时间词汇

| 名称 | 含义 |
|---|---|
| `eventTime` | canonical 市场事件时间；通常来自 provider，当前 TDX 例外使用 datasource `capturedAt` |
| `capturedAt` | 终端或 datasource 捕获时间 |
| `receivedAt` | 当前服务接收时间 |
| `acceptedAt` | 边界验证通过时间 |
| `closedAt` | K 或业务窗口封存时间 |
| `createdAt/updatedAt` | 持久化记录审计时间 |

禁止用 backend 当前时间、`receivedAt` 或 `acceptedAt` 替代缺失的 provider `eventTime`。当前已评审的
TDX `get_market_snapshot` runtime 不提供业务时间字段，因此 TDX converter 必须忽略 native 中偶然出现的
`AsOf`、`DateTime` 或其他时间别名，直接把 schema-v2 decoder 已校验的 datasource `capturedAt` 映射为
canonical `eventTime`；QMT 仍只使用其 fixture-backed native business time，不得套用该例外。Historical
`K.timestamp` 已定案保留：TDX/QMT 各自解析 provider historical bar time 后写入，不要求原始格式相同。

### 6.5 K 线缺失和精度

- OHLC 保持 MySQL `DECIMAL(20,2) NOT NULL`。
- MySQL driver 可以把 OHLC `DECIMAL(20,2)` materialize 为 fixed-scale string；历史与实时的新计算链路
  必须在进入 Chan、Indicator 或 Strategy 前复用同一个显式纯函数价格 projector：历史 fixed-scale
  string 转为 finite JavaScript number，实时 number 只做同一契约校验。不得直接比较数据库字符串、在各
  consumer 内重复 `Number(...)`，或用全局 TypeORM/mysql2 decimal coercion 连带转换 `volume/amount`。
- 该价格 projector 只形成计算视图，不修改、回填、舍入或重写 MySQL/Redis OHLC，也不是 HTTP/Nest
  interceptor。OHLC 继续使用现有 number 比较与指标运算；只有 `volume/amount` 使用 exact decimal
  comparison/arithmetic。
- TypeScript 未初始化 OHLC 使用进程内 `Number.NaN` sentinel。
- 所有 writer 在 JSON、TypeORM 和 MySQL 边界前验证 OHLC 为有限数。
- 缺失、空值、非数值或非有限 OHLC 使非空结果整批 fail closed。
- 显式数字 `0` 是有效值，不能当作缺失。
- `volume/amount` 使用 nullable exact `DECIMAL(36,8)`。
- `volume/amount` 的有效有限值以十进制字符串或等价 exact 表达保存，不取整。
- 缺失、空值、`NaN` 或 `Infinity` 归一为 `null`，不得补零。
- Redis、MySQL、wire 与 canonical raw `StrategyBar` 必须保留原始 null，不得用前值覆盖事实数据。
- 唯一已批准的消费层例外是策略共享纯函数 `QuantityForwardFillProjector`：它只能在
  `(securityId, source, period, tradingDay)` 内分别为 volume/amount 生成 evaluation effective view，
  只读更早值，不读 future，不跨交易日，不写回 raw bar 或持久化层。显式 `"0"` 是有效观察。
- 同交易日没有前值时保持 unavailable；日线每根 K 的 tradingDay 不同，不能继承上一根日线。停牌日
  没有 K 时不得虚构 bar 或 evaluation anchor。
- derived period 必须先用 raw constituents 完成聚合，再对 final raw derived bar 应用 projector；
  不得先 forward-fill 组成 1m 后参与合计。
- 持久化 Signal/Backtest result 必须复用共享 contextSnapshot serializer：`k.volume/k.amount` 保持
  evaluator 实际使用的 canonical scalar；compiled execution plan 消费的量额 observation 另存
  `quantityEvidence.current/previous.{volume|amount}`，每项固定为
  `raw: string|null`、`effective: string`、`resolution: observed|forwardFilled`。evidence 按 plan 在
  `all/any` 短路前 materialize；plan 不消费量额时省略。`unavailable` 只属于进程内 evaluability，
  不产生结果或 snapshot；不得以 `k.type`、`evaluationQuality`、完整 raw K 副本或新数据库字段替代。
- `NaN` 只能作为进程内 sentinel，不能跨 wire 或落库。

### 6.6 数据库命名和完整性

- TypeScript 属性使用 camelCase，受管 MySQL 物理列使用 snake_case。
- 审计属性统一为 `createdAt/updatedAt`，物理列统一为 `created_at/updated_at`。
- TypeORM 必须显式声明物理列名，不依赖隐式命名策略猜测现网 schema。
- 已应用 migration 永不重写，只新增 forward-only migration。
- 新 FK/unique/index 必须同时更新 entity metadata、migration、审计 SQL 和约束测试。
- immutable strategy/backtest snapshot 不得写入 NULL，也不得用 `{}` 伪造旧数据。
- backtest result 幂等键保持
  `(backtest_run_id, security_code, signal_time)`；多策略通过不同 run 区分。

已删除且不得恢复：

- 三张 K extension 的 `fullCode`；
- QMT extension 的 `effectiveDividendType`；
- QMT extension 的 `nativePeriod`；
- Chan persistence entity、repository 和旧表模型。

Chan 当前为请求时实时派生计算，不写 MySQL。未来若重新持久化，必须作为新的 schema/change
重新设计，不能恢复已删除 entity。

### 6.7 当前明确延期或不实施的能力

- 收盘后 provider history sync 无限期延期且当前无 active change；不得启用 `apps/schedule` 自动写入。
- `apps/schedule` 保留给后续职责设计，不恢复旧通用 scheduler。
- AlertEvent 当前只要求能够发送；不擅自增加严格状态机、attempt、retry 或 dead-letter 字段。
- 当前产品范围不支持期货和期权；不得用股票字段语义推断未来衍生品 schema。

## 7. 命名、文件和目录规则

- Mist Backend 的 DTO/VO class 后缀、文件后缀、目录和边界以
  [`mist-backend-code-style-guide.md`](./mist-backend-code-style-guide.md) 为准。
- TypeScript 文件使用 kebab-case，Python 文件使用 snake_case。
- 文件 basename 应反映主要导出职责，使用准确后缀：`.service`、`.controller`、`.decoder`、
  `.entity`、`.guard`、`.util`。
- 同职责 provider 模块保持相同相对目录；provider-qualified service basename 应可独立检索。
- 不同 provider 目录中的 `realtime.client.ts`、`runtime.py` 等同名文件不自动算技术债。
- `utils`、`common`、`helpers` 不得成为无所有权杂物箱。
- provider-native 名称可以在 decoder 输入侧原样存在；进入 Mist-owned canonical/领域层后必须使用
  Mist 词汇。
- 文件、类型和类重命名必须检查 import、barrel export、测试名、Nest module、TypeORM entity、
  OpenAPI、脚本、文档和 fixture。

## 8. 正确性、并发与资源边界

新增或审查任何运行时链路时，至少确认：

- collection 在遍历期间是否可能由 callback 并发修改；
- queue、pending map、dedupe map、cache 和 retry list 是否有硬上限；
- 每个外部请求是否有 timeout，整轮任务是否有 deadline；
- 失败是否清理 owner、subscription、timer、socket、promise 和临时状态；
- 帧大小、深度、symbol 数和字段数是否在高成本解析前受限；
- 数据库多表写入是否需要事务；
- 幂等键冲突是否与其他数据库错误精确区分；
- 自动恢复是否会因缺字段、旧 owner 或非交易时段而错误重启；
- 空结果、部分结果、非法非空结果分别是什么语义；
- 测试是否覆盖乱序、重复、边界值、断连、重连和清理路径。

## 9. 跨仓变更检查矩阵

公共字段或健康状态变化时，逐项确认：

| 影响面 | 必检内容 |
|---|---|
| `mist-datasource` | producer、Pydantic/OpenAPI、HTTP/WS、fixture、negative test |
| `mist` | decoder、canonical model、store、controller、deployment gate |
| `mist-deploy` | health、smoke、soak、restart isolation、recovery、Compose env |
| `mist-monitoring` | parser、metric、alert、watchdog、contract test |
| `mist-fe` | API type、页面状态、时间/nullable 展示 |
| terminal bridge | 安装路径、实际加载 artifact、SHA-256、owner 注册 |
| database | migration、preflight、postflight、readback、旧应用兼容性 |
| OpenSpec/docs | stable spec、active change、tasks、evidence、运行手册 |

只修改其中一个仓库不代表链路完成。

## 10. 每次开发必须执行的短检查清单

### 设计

- [ ] 已记录仓库、branch、SHA、dirty/worktree 范围。
- [ ] 已找到相关 stable spec、active change、migration 和真实部署入口。
- [ ] 已建立 producer-to-consumer 影响链。
- [ ] 已判断是否需要 OpenSpec。
- [ ] 未确认的 provider/数据库语义已停下来讨论。

### 实现

- [ ] provider-native、wire、canonical、persistence 四层没有混名。
- [ ] 状态、时间和标识符使用本指南词汇。
- [ ] 缺失值没有被静默补零、补空字符串或补当前时间。
- [ ] collection、queue、retry 和 pending map 有界且可清理。
- [ ] 数据库变更使用新增 migration，并同步 ORM/raw SQL/审计。
- [ ] 文件移动和重命名已更新完整影响面。
- [ ] 没有恢复已删除字段、Chan persistence 或延期 schedule 能力。

### 验证

- [ ] 定向测试和 negative contract test 通过。
- [ ] 受影响仓库 lint/typecheck/full tests 通过。
- [ ] OpenAPI、fixture 和 `.sha256` 已同步。
- [ ] `openspec validate --all --strict` 通过。
- [ ] 退役名称和旧路径全工作区检索为零，归档证据除外。
- [ ] 涉及终端/生产行为时已完成 HIL，而不是只依赖 CI。
- [ ] 验证报告区分“通过、跳过、环境阻塞、待交易时段验证”。

## 11. 仓库验证基线

按影响范围运行；不得用定向测试冒充完整基线。

### `mist`

```bash
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```

### `mist-datasource`

```bash
uv run pytest
uv run ruff check .
uv run pyright
```

重新生成或检查 OpenAPI，并确认退役字段不再出现。

### `mist-deploy`

使用 `pwsh-preview` 运行受影响的 health、smoke、soak、restart isolation、recovery 和
Compose contract tests。

### `mist-monitoring`

运行全部 Go 测试、Python 测试和指标契约测试。

### `mist-fe`

运行仓库定义的 lint、typecheck、unit tests 和 production build；同时检查 nullable、时间和
错误状态在 UI 中的表达。

## 12. 审查输出模板

每次质量校对至少输出：

```markdown
## 范围
- repo / branch / SHA / dirty status
- 是否包含 worktree、生产 HIL、数据库和跨仓消费者

## 结论
- 通过：
- 已修复：
- 待讨论：
- 未验证/环境阻塞：

## Findings
| ID | 状态 | 严重度 | 文件:行 | producer → consumer 影响 | 建议 |

## 验证
| 命令/证据 | 结果 | 说明 |

## 发布与回滚
- 原子发布集合：
- migration 兼容性：
- HIL：
- 回滚或 repair-forward：
```

严重度按“影响 × 发生可能性 × 暴露范围”判定。只有可能造成误路由、错误恢复、错误健康判定、
数据损坏或消费者不兼容的问题才列为高风险。缺少共享基类、provider 目录中存在相同文件名等现象
本身不是缺陷。

## 13. 可直接交给 AI 的校对提示词

```text
请在本次 Mist 开发中加载并遵守：
mist/docs/project-quality-governance-guide.md

开始前：
1. 记录所有涉及仓库的 branch、HEAD、dirty/worktree 范围。
2. 查找相关 stable OpenSpec、active change、migration 和部署入口。
3. 建立 producer → wire → decoder → state/persistence → consumer →
   deploy/monitoring 影响链。
4. 识别需要 OpenSpec 或需要我逐字段确认的事项；遇到指南第 5 节情形必须暂停讨论。

实现时：
- 保持 provider-native、wire、canonical、database 四层边界；
- 不恢复指南列出的退役字段、兼容别名、Chan persistence 或延期 schedule 能力；
- 公共契约和数据库变更同步完整跨仓影响面；
- 缺失值、时间、readiness、owner、precision、nullability、并发和资源上限按指南执行。

完成后：
1. 按指南第 10、11 节校对。
2. 全工作区检索旧字段和旧路径，归档证据除外。
3. 运行受影响仓库的完整验证，不用定向测试代替全量门禁。
4. 分别报告通过、跳过、环境阻塞和待 HIL 项。
5. 更新 OpenSpec tasks/evidence；只有所有要求和任务完成后才归档。
```

## 14. 维护规则

- 新的跨项目治理结论先写入对应 stable spec，再更新本指南摘要。
- 新 stable/active spec 中可跨 change 复用的规则按
  [`governance/openspec-and-documentation-governance-guide.md`](./governance/openspec-and-documentation-governance-guide.md)
  提炼，并登记到
  [`governance/spec-derived-governance-map.md`](./governance/spec-derived-governance-map.md)。
- 本指南只记录当前仍有效的规则；一次性执行记录留在 audit/change report。
- 规则被替代时直接更新本指南，并在 active change 中说明 breaking impact。
- 至少在重大跨仓发布、数据库 migration 或 OpenSpec 批量归档后复核一次。
- 文档中的路径、命令和 active/deferred 状态必须随仓库演进更新，不保留已失效的“当前状态”。
