## ADDED Requirements

### Requirement: Phase A 使用 BiService 私有归约方法

系统 SHALL 在 `BiService` 的私有 `reducePhaseATimeStack(candidates, data)` 方法中实现 Phase A
单时间栈归约。该方法 MUST 直接复用既有的三笔合并、合并产物构造与 valid 判定原语，不得
通过 operations 回调间接调用。

#### Scenario: service-phase 测试调用 Phase A

- **WHEN** 测试通过 NestJS Test module 构造 `BiService` 并调用其私有 Phase A 方法
- **THEN** 方法 SHALL 返回归约结果，且测试 SHALL 可通过 `jest.spyOn` 验证既有私有原语被直接调用
- **AND** 方法 SHALL NOT 修改输入数组或输入笔对象

#### Scenario: 已独立验证的 Phase A 收口到服务

- **WHEN** 原 Phase A helper 的全部场景已迁移为 service-phase 测试
- **THEN** `BiService` SHALL 使用私有方法完成 Phase A
- **AND** helper 源文件与 operations 接口 SHALL 被删除

### Requirement: Phase A 维护一个严格连续的时间栈

Phase A SHALL 使用一个按时间排序的栈处理 Complete 候选笔，不再拆分 confirmed 与 pending。
每一对相邻 Complete Bi MUST 共享同一边界索引，最终结果 MUST NOT 依靠排序修复时间顺序。

#### Scenario: 相邻候选保持时间顺序

- **WHEN** Phase A 接收由交替分型序列生成的候选笔
- **THEN** `BiService` 私有 Phase A 方法 SHALL 按分型时间升序入栈
- **AND** 每对相邻 Complete Bi SHALL 满足
  `previous.endFenxing.middleIndex == current.startFenxing.middleIndex`

#### Scenario: leading Invalid 被保留

- **WHEN** 一个或多个开头 Invalid 候选无法通过三笔规则归约
- **THEN** Phase A SHALL 把它们保留在栈首
- **AND** Phase A SHALL 不清除、不重排地把它们交给 Phase B

#### Scenario: 尾部未完成笔被构建

- **WHEN** 行情数据在最后一条 Complete Bi 分型之后仍有剩余
- **THEN** `BiService` SHALL 只在 Phase A Complete 栈尾构建或延长一条 UnComplete Bi
- **AND** 前面的 Complete Bi 时间栈 SHALL 保持不变

### Requirement: Phase A 把相邻栈顶三笔循环归约到局部固定点

每次候选入栈后，Phase A SHALL 只检查栈顶三笔。当三笔至少包含一条 Invalid 且现有三笔
合并条件成立时，Phase A SHALL 合并三笔，并立即重新检查新的栈顶。

#### Scenario: 一条新候选触发连续多次归约

- **WHEN** 一次栈顶三笔合并产物与前面的两笔重新组成可合并的栈顶三笔
- **THEN** Phase A SHALL 在同一次候选处理过程中继续下一次合并
- **AND** Phase A SHALL 继续执行，直到当前栈顶三笔无法再归约

#### Scenario: 栈顶三笔全部 Valid

- **WHEN** 栈顶三笔全部为 Valid
- **THEN** Phase A SHALL 停止当前局部归约
- **AND** Phase A SHALL 保留这三笔

#### Scenario: 栈顶包含 Invalid 但无法合并

- **WHEN** 栈顶至少一笔为 Invalid 且现有三笔合并条件返回 false
- **THEN** Phase A SHALL 停止当前候选的局部归约
- **AND** Phase A SHALL 保留这三笔供后续候选和 Phase B 使用

#### Scenario: 合并产物重新判定状态

- **WHEN** Phase A 用一条合并笔替换栈顶三笔
- **THEN** `BiService` 私有 Phase A 方法 SHALL 在下一次归约前使用现有候选有效性规则重新判定该笔
- **AND** 下一次栈顶判断 SHALL 使用新的 Valid 或 Invalid 状态

### Requirement: Phase A 拒绝不连续的入栈和三笔合并

Phase A MUST 在候选入栈前及每次三笔合并前校验索引连续性。它 MUST NOT 把时间缺口压入栈，
也 MUST NOT 跨越栈内已经存在的 Complete Bi 区间进行合并。

#### Scenario: 新候选未延续当前栈尾

- **WHEN** 新 Complete 候选的开始 `middleIndex` 与当前 Complete 栈尾的结束 `middleIndex`
  不同
- **THEN** `BiService` 私有 Phase A 方法 SHALL 报告包含两个冲突索引范围的内部不变量错误
- **AND** 该方法 SHALL NOT 把不连续候选压入栈

#### Scenario: 栈顶三笔边界不连续

- **WHEN** `bi1.endFenxing.middleIndex` 不等于 `bi2.startFenxing.middleIndex`，或
  `bi2.endFenxing.middleIndex` 不等于 `bi3.startFenxing.middleIndex`
- **THEN** `BiService` 私有 Phase A 方法 SHALL 报告包含冲突索引范围的内部不变量错误
- **AND** 该方法 SHALL NOT 创建跨越缺口的合并笔

#### Scenario: 连续三笔合并保持外边界

- **WHEN** 三条连续栈顶笔成功归约
- **THEN** 合并产物 SHALL 使用第一笔的开始分型
- **AND** 合并产物 SHALL 使用第三笔的结束分型
- **AND** 替换项外侧的相邻笔 SHALL 继续保持连续

### Requirement: BiService 直接组合两个私有阶段

`BiService` SHALL 调用私有 `reducePhaseATimeStack`，并把完整 Phase A 结果交给私有
`mergeBiSegments`。Phase B MUST 直接复用既有两笔原语，且公共接口 MUST 保持不变。

#### Scenario: Phase A 留下 residual Invalid

- **WHEN** Phase A 达到局部固定点但仍包含 Invalid
- **THEN** Phase B SHALL 在相同时间位置接收到这些 Invalid
- **AND** Phase B MAY 按现有变长区间规则继续归约

#### Scenario: 调用方请求笔结果

- **WHEN** `BiService.getBi` 完成两个阶段
- **THEN** 它 SHALL 继续返回 `{ phaseA, phaseB }`
- **AND** Channel SHALL 继续使用 Phase B

#### Scenario: 两个阶段保持独立但不保留 helper 边界

- **WHEN** Phase A 与 Phase B 完成服务集成
- **THEN** `BiService` SHALL 以两个独立私有方法执行两个阶段
- **AND** `PhaseATimeStackOperations`、`PhaseBMergeOperations` 和两个 helper 源文件 SHALL NOT 存在
- **AND** `BiService` SHALL 作为唯一组合边界

### Requirement: 完整真实数据保护 Phase A 与 Phase B 回归

后端测试套件 SHALL 包含完整沪深300 2024-2025 和完整上证指数 2024-2025 合并 K 快照，并在
内联迁移后验证两个阶段结果保持稳定。

#### Scenario: 完整沪深300 Phase A 结构有序

- **WHEN** 单栈 Phase A 处理全部 388 根沪深300合并 K
- **THEN** 每对相邻 Complete Bi SHALL 连续
- **AND** valid Complete Bi SHALL 不发生重叠
- **AND** Phase A SHALL 不存在仍可按三笔规则归约的相邻三笔
- **AND** 旧的 `206 -> 302` / `222 -> 228` 重叠见证 SHALL 不存在

#### Scenario: 完整上证指数保持关键回归结果

- **WHEN** 单栈 Phase A 与现有 Phase B 处理全部 386 根上证指数合并 K
- **THEN** Phase A SHALL 输出 35 笔，Phase B SHALL 输出 25 笔
- **AND** Phase A SHALL 保留 `142 -> 146 down(invalid)`
- **AND** Phase B SHALL 输出 `142 -> 195 down(valid)`
- **AND** Phase B SHALL 输出 `266 -> 317 up(valid)`

#### Scenario: 原有上证指数裁剪场景保持稳定

- **WHEN** 新 Phase A 为现有 2024 年 10 月与 2025 年 5–8 月上证指数测试数据提供输入
- **THEN** `bi-merge-cases` 现有 6 个测试 SHALL 全部通过
- **AND** 原有长 down 与长 up 的 Phase B 端点 SHALL 保持不变

#### Scenario: 前端快照在内联迁移后保持不变

- **WHEN** Phase A/Phase B 内联、完整真实数据与 service-phase 测试全部通过
- **THEN** `mist-fe` 已提交的 Phase A/Phase B 快照 SHALL 保持零 diff
- **AND** `/chan-tests` SHALL 继续用既有快照检查沪深300、上证指数、创业板和贵州茅台
