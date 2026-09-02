# Tasks: guard-chan-central-trend-structure

- [x] 1. 规范化 `channel.ts` 基础中枢首末笔进入/离开边界几何判据 (`firstBi.low < zd`, `lastBi.high > zg`, `firstBi.high > zg`, `lastBi.low < zd`)
- [x] 2. 在 `channel.ts` 延伸循环中加入走势极值结构破坏守卫 (`b.low < curDd` / `b.high > curGg`)
- [x] 3. 运行 `libs/chancore` 全部 16 个测试套件，确保 100% 通过
- [x] 4. 在 29 号回测数据（000001 5m）上实证核验：
  - [x] 4.1 2026-01-07 09:55 正确作为首个笔中枢起笔
  - [x] 4.2 2026-01-13 14:50 最低点 4126.23 正确终结第 2 个向下笔中枢，后续 4190.87 强力反弹不再被吞噬
- [ ] 5. 提交推送至 master，并在 Windows 栈上部署与验证
