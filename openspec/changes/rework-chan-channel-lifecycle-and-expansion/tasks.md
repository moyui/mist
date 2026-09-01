# Tasks: rework-chan-channel-lifecycle-and-expansion

## 1. 算法核心重构 (chancore)
- [x] 1.1 在 `channel.ts` 中实现笔级顺序确认中枢状态机（formation $\to$ touch extension $\to$ 3rd BSP closure $\to$ 9-wave enlargement）
- [x] 1.2 在 `duan-channel.ts` 中实现段级顺序确认中枢状态机（对称重叠 + 触及延伸 + 闭合）
- [x] 1.3 约束 `central-expansion.ts` 中的中枢扩张归并为严格相邻对处理，防止无界级联吞并
- [x] 1.4 递增 `ChanCore.algorithmVersion`（6 $\to$ 7）

## 2. 单元测试与边界验证
- [x] 2.1 编写/更新 `channel.spec.ts`：覆盖触及延伸、三买卖点闭合、9笔扩展、小转大等场景
- [x] 2.2 编写/更新 `duan-channel.spec.ts`：覆盖段级中枢顺序确认与延伸闭合
- [x] 2.3 编写/更新 `central-expansion.spec.ts`：验证相邻扩张与防级联串联
- [x] 2.4 运行 `npm run test:chancore` 确保所有 chancore 单元测试通过

## 3. 回测与真实数据验证 (Backtest 28 验收)
- [x] 3.1 针对回测 28 的 TDX 5m 数据执行复测，确认 139 笔怪物中枢已拆解为符合行情实际的多个独立中枢
- [x] 3.2 针对 QMT 5m 数据执行复测对照
- [x] 3.3 更新 `chan-full-output.characterization.spec.ts` 全量快照

## 4. 文档与治理
- [x] 4.1 更新 `AGENTS.md` 缠论算法定论与中枢生命周期规则
- [x] 4.2 审查并归档 OpenSpec change
