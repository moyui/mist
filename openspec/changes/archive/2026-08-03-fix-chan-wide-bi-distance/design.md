## Context

`BiService.isWideBi` 当前用 `middleOriginId` 的数值差计算两个分型极值 K 之间的原始 K 数量。
`middleOriginId` 来自 TypeORM `K.id`，而 `K.id` 是整张 `k` 表的自增主键；它可以被其他股票、来源、
周期、删除或失败事务拉开，与当前有序输入中的相对位置无关。

每条候选 Bi 已持有 `originData`。`collectMergedKRange` 按合并 K 顺序和每个 `mergedData` 的原始顺序
构建该数组，并以 ID 去重后保持首次出现顺序，因此它是宽笔规则所需的局部原始 K 序列。

## Goals / Non-Goals

**Goals:**

- 按候选 Bi 的有序 `originData` 位置计算极值 K 之间的真实原始 K 数量。
- 保持数据库 ID 的身份/追踪语义和全部现有 HTTP 输出字段。
- 证明连续 ID、任意 gapped ID 与 interleaved ID 不改变相同有序行情的宽笔结论。
- 对无法在候选原始 K 中定位分型极值的内部不变量破坏明确失败。

**Non-Goals:**

- 不修改宽笔阈值：“两根极值 K 之间至少 3 根原始 K”保持不变。
- 不修改分型、Phase A、Phase B、未完成笔或 Channel 算法。
- 不抽取 ChanCore，不新增公共 ordinal/reference，也不修改 DTO/VO、数据库或 API。
- 不以时间差、交易日差或数据库 ID 差替代序列位置。

## Decisions

### 1. 距离来源固定为候选 Bi 的有序 `originData`

`isBiWideEnough` 把候选 Bi 的 `originData` 交给宽笔校验。校验在该数组中定位
`startFenxing.middleOriginId` 与 `endFenxing.middleOriginId`，并计算：

```text
betweenCount = abs(endPosition - startPosition) - 1
```

`betweenCount >= 3` 才满足现有宽笔阈值。ID 只用于在同一数组内找到对应 K，ID 的数值大小和差值
不参与距离计算。

选择局部 `originData` 而不是在 singleton `BiService` 上保存 request-scoped position map，可以避免并发
请求共享可变状态，也不需要把 map 参数穿透 Phase A/Phase B 的全部私有方法。候选数据规模有界，
一次线性定位的复杂度足够。

### 2. 缺失或重复 identity 是内部不变量错误

候选 Bi 的两个 `middleOriginId` 必须分别且唯一地存在于其 `originData`。无法定位或出现重复 ID 时，
算法抛出包含冲突 ID 的普通内部 `Error`，由现有顶层错误治理处理；不得使用主键差值回退，也不得把
不完整数据静默判为有效。

### 3. 通过 identity-invariance 测试证明修复

定向测试覆盖：

- 两根相邻 K 即使 ID 相差很大，仍为 0 根中间 K；
- 恰好 3 根中间 K 时通过，少于 3 根时拒绝；
- 相同有序价格/时间序列仅替换为 gapped/interleaved ID 后，非 identity 的 Bi 结构与状态保持一致；
- `middleOriginId/originIds` 仍返回替换后的真实 ID，证明没有引入伪 ordinal。

## Risks / Trade-offs

- [现有测试 fixture 依赖 ID 差制造宽度] → 改为显式构造有序 `originData`，让测试表达真实规则。
- [局部线性定位增加少量 CPU] → 候选范围有界且修复保持实现简单；如真实 profiling 证明需要优化，
  再在纯调用栈内引入只读 map，不能使用 service 实例状态。
- [修复改变历史 Bi 结果] → 这是预期 bugfix；保留完整定向回归，并在 ChanCore extraction 前重新生成
  characterization baseline，而不是宣称旧 fingerprint 不变。

## Migration Plan

1. 先增加能复现 gapped-ID 假宽笔的失败测试。
2. 改为按 `originData` 位置计算，增加阈值边界和内部不变量测试。
3. 运行 Chan Bi 定向、完整 Chan suites、全后端 gates 与 strict OpenSpec。
4. 合并本 change 后，在 `extract-chan-core` 中以修复后的结果建立新 fingerprint。

本 change 没有数据库或部署迁移；代码回退即可恢复旧实现，但旧实现存在已确认的错误，生产回滚不作为
常规验收项。

## Open Questions

无。
