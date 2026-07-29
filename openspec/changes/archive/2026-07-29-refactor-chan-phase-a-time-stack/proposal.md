## Why

Phase A 目前把候选笔拆分到 `confirmed` 与 `pending` 两个数组。较新的时间段可能已经进入
`confirmed`，较旧的分支却仍留在 `pending`；随后取栈尾时又优先选择 `pending`，从而跳过
中间已经确认的笔。完整沪深300快照已经复现：算法生成 `206 -> 302 up(valid)`，同时保留
其内部八条 valid 笔。

Phase B 已负责消化 Phase A 遗留的多笔 invalid 区间，因此 Phase A 可以改成严格按时间排列
的单栈，并把自己的“连续三笔”规则反复执行到局部固定点。两个阶段先以独立纯算法文件完成
了行为验证；本 change 的最终收口是将已经稳定的规则直接归属到 `BiService`，减少 operations
回调和跨文件跳转，同时保持原有的阶段边界与输出不变。

## What Changes

- 将已验证的 Phase A 时间栈与 Phase B invalid 区间归约内联为 `BiService` 私有方法；删除两个
  helper 源文件和 operations 回调接口。
- 候选笔按时间压入一个栈；每次入栈后反复归约栈顶三笔，直到不足三笔、三笔全 valid，或
  当前三笔无法合并。
- 候选入栈前和三笔合并前都校验共享 `middleIndex` 边界，禁止跨越已经存在的时间区间。
- 每次合并后重新判定 valid/invalid，并立即重新检查新的栈顶三笔。
- 无法归约的 valid、invalid 全部原位保留，作为完整有序输入交给 Phase B。
- 保留原 helper 的完整测试覆盖，迁移为使用 NestJS Test module 的 service-phase 测试；测试通过
  `jest.spyOn` 验证 `BiService` 直接复用既有私有原语。
- 增加完整沪深300与完整上证指数真实快照回归，同时保留上证指数现有两个裁剪场景的 6 个
  Phase B 测试。
- 删除双数组来源标记、跨数组取尾、来源相关弹栈以及最终排序逻辑。
- 保持 `{ phaseA, phaseB }` 公共结构、HTTP 返回和 Channel 使用 Phase B 的行为不变。

## Capabilities

### New Capabilities

- `chan-bi-phase-a-reduction`：定义 Phase A/B 在 `BiService` 内的阶段边界、单时间栈、栈顶
  三笔循环归约、invalid 区间固定点归约，以及完整沪深300和上证指数回归要求。

### Modified Capabilities

无。

## Impact

- `apps/mist/src/chan/services/bi.service.ts` 直接拥有两个阶段的私有归约方法和双数组代码清理。
- 删除 `bi-phase-a-time-stack.helper.ts`、`bi-phase-b-merge.helper.ts`，并把其测试改名为
  `bi.service.phase-a.spec.ts`、`bi.service.phase-b.spec.ts`。
- 后端新增完整沪深300（388 根合并 K）与完整上证指数（386 根合并 K）测试数据。
- 本次纯归属迁移不得改变 `mist-fe` 的任何阶段快照、前端 API 或渲染协议。
- 不新增运行时依赖、开关、数据库变更或 HTTP 字段。
