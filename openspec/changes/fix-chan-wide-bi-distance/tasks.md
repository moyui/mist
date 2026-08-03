## 1. 回归基线

- [ ] 1.1 增加相邻原始 K 使用大间隔数据库 ID 时不得形成假宽笔的失败测试。
- [ ] 1.2 增加恰好 3 根/少于 3 根中间 K 的阈值边界测试，以及缺失/重复极值 ID 的内部不变量测试。
- [ ] 1.3 增加相同有序价格/时间序列替换为 arbitrary gapped/interleaved ID 后，非 identity Bi 结果
  保持一致且 identity 输出仍为真实输入 ID 的回归测试。

## 2. 宽笔距离修复

- [ ] 2.1 让宽笔校验从候选 Bi 的有序 `originData` 定位两个 `middleOriginId`，按位置差计算
  `betweenCount`。
- [ ] 2.2 删除数据库 ID 差值距离逻辑；缺失或重复 endpoint identity 时抛出明确内部不变量错误。
- [ ] 2.3 确认实现不增加 request-scoped service 状态、公共 ordinal/reference、DTO/VO/schema 或其他
  Chan 算法变化。

## 3. 验证与交付

- [ ] 3.1 运行 `bi.service` 定向测试以及全部 Chan service/controller/persistence tests。
- [ ] 3.2 运行 lint check、typecheck、test、build 和 `ci:contracts`；区分已知基线失败与本 change 回归。
- [ ] 3.3 执行 `openspec validate fix-chan-wide-bi-distance --strict`、全部 strict OpenSpec validation 和
  `git diff --check`。
- [ ] 3.4 记录本 change 是 `extract-chan-core` characterization baseline 的前置依赖，并向项目负责人
  提交验证证据。
