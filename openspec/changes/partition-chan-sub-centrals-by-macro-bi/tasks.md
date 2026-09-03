# Tasks: partition-chan-sub-centrals-by-macro-bi

- [x] 1. 在 `libs/chancore` 中实现 `getAdjacentBoundedChannels`
  - [x] 1.1 在 `channel.ts` 中实现按宏观笔时间窗口切片次级别笔并分别求值中枢逻辑
  - [x] 1.2 在 `ChanCore` 暴露 `createAdjacentBoundedChannels`
  - [x] 1.3 编写 `channel-bounded.spec.ts` 单元测试，覆盖标准嵌套、多中枢、单边无中枢及边界时间对齐等场景
- [x] 2. 在 `libs/visual-command` 中集成父级别约束
  - [x] 2.1 在 `ChanVisualOptions` 扩展支持 `macroBis`
  - [x] 2.2 当提供 `macroBis` 时，次级别中枢使用 bounded 算法生成绘图指令
  - [x] 2.3 补充 visual-command 对应单测
- [x] 3. 运行 `libs/chancore` 与 `libs/visual-command` 全部测试套件确保 100% 通过
- [x] 4. 在实盘与 `/chan` 页面（000001 30m+5m）上联调核验，确认中枢完全内生于 30m 笔且无跨顶撕裂
