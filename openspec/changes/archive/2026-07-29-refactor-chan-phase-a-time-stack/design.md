## Context（背景）

当前 `BiService` 使用 `confirmed` 和 `pending` 两个数组处理 Phase A 候选笔，最终再将两个
数组拼接并按开始时间排序。这个状态模型允许较新的时间区间进入 `confirmed`，同时保留一个
更早的 `pending` 分支。由于取最后两笔时优先读取 `pending`，后续合并可能跳过时间上更新的
`confirmed` 区间。

完整沪深300快照中的关键错误发生在候选 step 126：`206 -> 222 up(valid)` 仍在 pending，
完整的 `222 -> 282` 已经进入 confirmed；算法却选择 `206 -> 222`、`282 -> 283`、
`283 -> 287` 作为三笔，最终扩张成 `206 -> 302 up(valid)`，内部八条 valid 笔仍然保留。

Phase A 与 Phase B 已分别以独立纯算法文件完成规则和边界验证。当前收口不再需要 operations
回调边界：两个算法将保留相同规则、以 `BiService` 私有方法直接调用既有原语，成为服务自身的
两个顺序阶段。

## Goals / Non-Goals（目标与非目标）

**目标：**

- 将已经独立验证的 Phase A 和 Phase B 算法内联到 `BiService`，并保留全部测试覆盖。
- 使用一个严格连续的时间栈替代 `confirmed`/`pending` 双数组。
- 每次候选入栈后，把连续栈顶三笔反复归约到局部固定点。
- 无法合并的 valid、invalid 保持原有时间位置，完整交给 Phase B。
- 把时间顺序和索引连续性变成构造不变量，而不是最终排序修补。
- 保留独立测试所覆盖的全部场景，迁移为 NestJS Test module 下的 service-phase 测试，再联合验证
  Phase A 与 Phase B。
- 使用完整沪深300和完整上证指数建立真实数据回归。

**非目标：**

- 不修改 `canMergeThreeBis`、`canMergeTwoBis`、分型检测、宽笔判定和区间统计规则。
- 不重写 Phase B，也不在本 change 判断 Phase B 剩余长笔是否符合业务语义。
- 不引入运行时开关，也不保留双数组算法作为备用路径。
- 不修改 HTTP 返回结构或前端 Phase A/Phase B 选择器。

## Decisions（技术决策）

### 1. Phase A 与 Phase B 最终归属于 BiService

独立 helper 是用于建立可控测试边界的中间验证步骤，稳定后不再是生产代码边界。最终由
`BiService` 直接拥有以下私有方法：

```typescript
private reducePhaseATimeStack(candidates: readonly BiVo[], data: MergedKVo[]): BiVo[];
private isPhaseBMergeableSpan(
  bis: readonly BiVo[],
  headIndex: number,
  tailIndex: number,
): boolean;
private mergeBiSegments(phaseABis: readonly BiVo[], data: MergedKVo[]): BiVo[];
```

它们直接调用已有的 `canMergeThreeBis`、`mergeThreeBis(..., data)`、`canMergeTwoBis`、
`mergeTwoBis(..., data)` 与 `isCandidateBiValid`。两个阶段仍是不同的私有方法，不能互相嵌套、
不能改变各自的固定点范围；只是删除 `PhaseATimeStackOperations`、`PhaseBMergeOperations` 和
仅为传递回调而存在的源文件。两阶段方法继续浅克隆输入，不能修改调用方数组或笔对象。

### 2. 单时间栈保持严格连续

候选笔按分型时间顺序进入一个 `BiVo[]`。候选入栈前，Phase A 私有方法校验：

```text
stack.last.endFenxing.middleIndex == candidate.startFenxing.middleIndex
```

任意相邻 Complete Bi 必须共享同一边界。合并成功时，只用栈顶三笔的首个起点和第三笔终点
构造替换项，因此替换后仍保留相同外边界。

这使 `BiSourceTag`、跨数组取尾、来源相关删除以及最终按时间排序全部失去必要性。

### 3. 栈顶三笔循环归约到局部固定点

每条候选入栈后执行：

```text
while 栈内至少有三笔:
  读取栈顶 bi1、bi2、bi3
  复核 bi1.end == bi2.start 且 bi2.end == bi3.start
  如果三笔全 valid：停止
  如果 canMergeThreeBis 返回 false：停止
  用 mergeThreeBis 合并三笔
  重新判定合并产物 valid/invalid
  用合并产物替换栈顶三笔
  继续检查新的栈顶三笔
```

每次成功归约把三笔变成一笔，栈长度减少 2，所以算法自然终止，不需要 `maxIterations`。

“每条候选最多归约一次”的方案被否决，因为它可能仅仅由于输入在此结束，就把 Phase A 自己
仍能处理的三笔留给 Phase B。循环归约能保证 Phase A 输出已经达到其三笔规则的局部固定点。

### 4. 连续性在入栈和合并两个边界校验

只在合并前校验还不够：栈不足三笔或栈顶三笔全 valid 时不会进入合并分支。因此 Phase A 私有方法必须：

1. 候选入栈前校验它与当前栈尾连续；
2. 三笔合并前再次复核两个共享边界。

任何不连续都属于内部不变量错误，错误信息必须包含冲突索引范围；不得静默接受、跨区间合并
或依靠排序修复。这从结构上阻止沪深300的 `206 -> 222` 跨过 `222 -> 282`。

### 5. 每次合并都重新判定状态

`mergeThreeBis` 继续返回 Unknown 状态。Phase A 私有方法使用 `isCandidateBiValid` 把合并产物重新标记为
Valid 或 Invalid，再决定是否继续下一轮栈顶归约。重新产生的 Invalid 可以继续参与归约。

### 6. 独立验证是中间步骤，最终直接调用服务原语

实施顺序固定为：

```text
Phase A/B helper 红灯单测
        ↓
实现并让两个 helper 独立测试通过
        ↓
保留测试场景，迁移为 service-phase 测试
        ↓
BiService 内联 reducePhaseATimeStack
        ↓
BiService 内联 mergeBiSegments
        ↓
删除 helper 源文件，运行完整真实数据与 Channel 联合回归
```

最终 `BiService.getBi` 直接顺序调用两个私有阶段方法：

```typescript
const phaseA = buildFinalUncompleteBi(
  this.reducePhaseATimeStack(candidates, data),
  data,
);
const phaseB = this.mergeBiSegments(phaseA, data);
```

两个方法保留相同的阶段边界，但不再通过 helper 文件或 operations 回调间接调用。

### 7. 完整沪深300与上证指数作为真实数据边界

后端测试目录各保存一份完整、可独立运行的真实合并 K 输入，不在运行时依赖 `mist-fe`：

- 沪深300 2024-2025：388 根合并 K；
- 上证指数 2024-2025：386 根合并 K。

沪深300首先用于证明旧实现的 8 对 valid 重叠以及 `206 -> 302`/`222 -> 228` 见证；修复后
要求 Complete Bi 连续、valid 无重叠、不存在仍可按 Phase A 规则归约的相邻三笔。

完整上证指数只读模拟结果为：

| 阶段 | 笔数 | 关键结构 |
|---|---:|---|
| 单栈 Phase A | 35 | `142 -> 146 down(invalid)`；`266 -> 317 up(valid)` |
| 现有 Phase B | 25 | `142 -> 195 down(valid)`；`266 -> 317 up(valid)` |

此外继续保留现有两个上证指数裁剪场景的 6 个 Phase B 测试，防止完整快照只验证总体数量却遗漏
国庆跳空与 2025 年 5–8 月震荡两个核心规则。

## Risks / Trade-offs（风险与权衡）

- **[风险] 纯迁移意外改变输出。** → 完整真实数据、裁剪场景和前端已提交快照必须零变化；任何
  数量或端点差异均按迁移失败处理，不刷新快照掩盖差异。
- **[风险] Phase A 与 Phase B 在部分输入上结果相同。** → 若 Phase A 已清除所有可归约三笔，
  阶段相同是合法结果，不为展示差异增加人为停止条件。
- **[风险] 两份完整真实快照增加仓库体积。** → 每个数据集只保存一份规范 fixture，并共享加载
  与结构断言 helper。
- **[风险] 不变量异常可能暴露新的候选连续性问题。** → 用包含索引的明确错误快速失败，不返回
  被污染的结构。
- **[风险] Phase B 仍可能生成结构连续但跨度较长的笔。** → 作为后续独立 change 评估，本次不
  修改 Phase B 规则。

## Migration Plan（实施与回退）

1. 保留已经完成的完整沪深300、完整上证指数和 helper 独立验证作为历史证据。
2. 先迁移并验证 Phase A 时间栈；保留所有 7 个 helper 测试场景，改为 service-phase 测试。
3. 再迁移并验证 Phase B invalid 区间归约；保留所有 9 个 helper 测试场景，改为 service-phase 测试。
4. 删除两个 helper 源文件和 operations 接口，运行真实数据、裁剪场景、`BiService`、Channel 与
   全量回归。
5. 确认 `mist-fe` 没有 diff，前端测试和既有快照仍全部通过；本次不生成或更新快照。

Phase A 内联、Phase B 内联和最终证据保持独立提交，可分别回退；OpenSpec change 保持未归档。

## Open Questions（待确认问题）

无。Phase B 剩余长笔语义明确推迟到后续 change。
