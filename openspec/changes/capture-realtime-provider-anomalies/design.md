## Context

当前 realtime subscription change 已通过正常 QMT/TDX control、callback、
converter、cleanup 和 deterministic fault tests。仍有少数 provider 负分支只有
真实 terminal/runtime 异常才能证明，例如 TDX snapshot 网络失败、
`TDX_UNSUBSCRIBE_NOT_CONVERGED`、`TDX_UNSUBSCRIBE_VERIFY_FAILED`，以及 QMT
native/journal/lease/callback 的现场异常。

在生产 bridge 或 wire 中增加临时 fault hook 会永久扩大攻击面和运行状态机，并
使人为故障容易被误记成 provider 语义。该 change 因此只定义真实异常出现后的
观察与复盘，不主动制造异常。

## Goals / Non-Goals

**Goals:**

- 为 TDX/QMT 真实异常提供一致的触发、只读采集、脱敏归档和恢复复盘流程。
- 保留 provider-specific 原始边界，同时输出稳定的 incident 分类。
- 为 realtime quantity 的真实缺失、非法值、counter 跳变和固定 profile 漂移保留同一 dormant
  capture owner，不在 candle change 中制造异常。
- 明确真实现场证据、deterministic test 和推断之间的区别。
- 在不阻塞当前正常路径发布的前提下，积累未来修正 provider contract 所需证据。

**Non-Goals:**

- 不增加 bridge fault plan、chaos switch、测试字段、HTTP/WS mutation route 或
  native method wrapper。
- 不在生产 HIL 中主动断网、伪造 active list、损坏 journal、替换 lease 或制造
  callback overflow。
- 不改变当前 control success/failure wire、自动 retry、recovery 或 monitoring
  语义。
- 不用真实 incident 采集替代 unit/contract/integration tests。

## Decisions

### 1. 采用事件触发的 dormant capture，而不是主动故障注入

采集工具平时不运行 mutation，也不修改 provider 状态。只有 monitoring、health、
bounded log 或 operator 已观察到真实异常后，操作员才启动只读采集。

备选方案是给 bridge 或 datasource 加一次性 fault hook；该方案会改变生产 artifact
和运行边界，因此拒绝。

### 2. evidence bundle 同时保存事实、分类和未知项

每次 incident 使用一个时间窗和 incident ID，保存：

- 双 provider mode、container/image、bridge installed path/SHA/build、owner
  generation 与 datasource/backend readiness；
- 触发前后 bounded health、typed control result、TDX fresh native list
  observation 或 QMT registry/journal 摘要；
- snapshot attempt/drop 的现有 bounded log；不得保存 lease token、完整 native
  行情、业务数据库内容或未脱敏路径；
- operator action、cleanup/recovery、最终 provider state；
- `observed|not-observed|unknown` 结论和证据 SHA-256。

没有权威 postcondition 时必须保留 `unknown`，不能由 callback silence、heartbeat
或另一 subscription 的进展升级。

### 3. provider-specific 分类不合并成一个通用 native state

TDX incident 分别分类 snapshot delivery failure、post-list still subscribed、
post-list unavailable 和 quantity contract deviation。QMT 分别分类 unsubscribe
return、journal durability、lease/owner fence、callback/queue anomaly 和 quantity
contract deviation。quantity 只记录 source、field、类型/grammar/scale/range/profile/
counter 类别、artifact identity 与时间窗，不保存完整 raw snapshot 或把两个 provider
强行映射为相同 native 字段。共同层只统一 evidence envelope，不统一 handle/list 语义。

### 4. 当前发布只记录 deferred gate

如果异常从未自然出现，则 manifest 记录 `not-observed` 和此 change 的引用。当前
正常路径 release 不因缺少 incident 而失败；deterministic tests 仍证明代码分支，
但不得标为 live terminal evidence。

## Risks / Trade-offs

- [真实异常可能长期不出现] → 保持 `not-observed`，不为了勾选门禁制造故障。
- [异常发生后现场快速消失] → 采集脚本优先读取已有 bounded logs/health，并记录
  capture delay；缺失项保持 `unknown`。
- [证据可能包含敏感信息] → 使用 allowlisted 字段、摘要和 SHA，禁止 lease token、
  raw native map、业务表内容及 free-form dump。
- [操作员恢复动作会改变现场] → 先采集 pre-recovery bundle，再执行现有 source-
  scoped recovery，最后采集 post-recovery bundle。

## Migration Plan

1. 先实现只读 evidence schema、脱敏器和离线 fixture tests。
2. 在 deploy runbook 增加真实异常触发条件、采集命令和恢复顺序。
3. monitoring 只链接 incident capture 手册，不自动执行 mutation 或故障。
4. 首个真实 incident 经人工 review 后再决定是否修改 provider contract。

回滚只需移除只读采集入口和文档；bridge、datasource、Mist runtime 及 provider
状态均无需回滚。

## Open Questions

- TDX/QMT terminal 各版本能够稳定提供哪些本地 bounded log 查询入口。
- incident bundle 的默认保留期和最终归档位置。
- 是否需要在未来独立 change 中增加只读 snapshot-attempt counter；本 change
  不预先增加。
