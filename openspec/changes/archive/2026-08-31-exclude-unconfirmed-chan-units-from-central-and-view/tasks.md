# Tasks: exclude-unconfirmed-chan-units-from-central-and-view

## 1. 段级中枢过滤（chancore）

- [ ] 1.1 `duan-channel.ts` `createDuanChannels` 入口：`duans.filter((d) => d.endBi !== null)`，
      Phase A/延伸/合并只消费确认段（函数体零改动）
- [ ] 1.2 空确认集 → `{ phaseA: [], phaseB: [] }`（与空输入语义一致）

## 1b. 笔级中枢过滤（chancore）

- [ ] 1b.1 `channel.ts` `createChannels` 入口：`data.filter((b) => b.status === BiStatus.Valid)`
      后进入 Phase A/延伸/合并（函数体零改动）
- [ ] 1b.2 空确认集 → 空中枢输出（与空输入语义一致）
- [ ] 1b.3 回归：全量 vs 过滤后输出一致（当前数据实证）——断言锁定等价性

## 2. 可视化过滤（visual-command）

- [ ] 2.1 `chan-visual.adapter.ts` 笔渲染：`status !== BiStatus.Valid` 跳过
      （不画 invalid 宽笔失败候选与 unknown 未完成尾笔）
- [ ] 2.2 `chan-visual.adapter.ts` 段渲染：`type !== Complete || endBi === null` 跳过
      （删除 `endBi ?? originBis[last]` 实线兜底）
- [ ] 2.3 `chan-visual.adapter.ts` 中枢渲染：构成单元含 `status !== Valid` 的笔/段 → 不画
      （防御性校验；chancore 计算链已保证，此为展示层最后防线）
- [ ] 2.4 确认且有效的笔/段/中枢绘制逻辑不变

## 2b. 买卖点 bi 级输入过滤（signal）

- [ ] 2b.1 `chan-bsp.pipeline.ts` `units='bi'` 分支：`phaseB.filter((b) => b.status === BiStatus.Valid)`
      后构造 units（当前 invalid/unknown 会进入 bi 级买卖点）
- [ ] 2b.2 `units='duan'` 分支不改（units 为段、实测无 invalid 污染）

## 3. 版本与契约

- [ ] 3.1 `chan-core.ts` `algorithmVersion` 5 → 6（注释补"仅确认段进入段中枢"）
- [ ] 3.2 `chan-core.spec.ts:25` 断言 5 → 6
- [ ] 3.3 `chan-full-output.characterization.spec.ts` 两处 payload `algorithmVersion` 5 → 6；
      两个 SHA 重算回填（主管道不含 duan；duan-expansion fixture 输入全 Complete，输出不变）

## 4. 单测

- [ ] 4.1 `duan-channel.spec.ts` 新增：未确认尾段不参与段中枢（全量相位A/B 等于剔除后输入）
- [ ] 4.2 既有 duan-channel 用例回归（全 Complete 输入）全绿
- [ ] 4.3 `chan-bi-width-validation` 用例回归（宽笔校验本身不变）全绿
- [ ] 4.4 新增断言：createDuan 的 Complete 段不含 invalid 笔（当前数据惰性区性质锁定）
- [ ] 4.5 `chan-full-output.characterization.spec.ts` / `chan-core.spec.ts` 回归

## 5. 全量验证与门禁

- [ ] 5.1 `jest libs/chancore --runInBand --forceExit` 全绿
- [ ] 5.2 `jest libs/visual-command --runInBand --forceExit` 全绿
- [ ] 5.2b `jest libs/signal --runInBand --forceExit`（chan-bsp pipeline 相关）全绿
- [ ] 5.3 `tsc --noEmit` 干净
- [ ] 5.4 `eslint libs/chancore/src libs/visual-command/src` 干净
- [ ] 5.5 `/tmp/duan-repro/check-uncomplete-consumption.ts` 复跑：段中枢 全量=剔尾、输出一致=true
- [ ] 5.6 `openspec validate exclude-unconfirmed-chan-units-from-central-and-view` 通过

## 6. 收尾

- [ ] 6.1 合回 master + push；spec 归档（`openspec archive -y`，失败降级 `--skip-specs` + 手工合）
- [ ] 6.2 重新部署生产（与会话确认时机与 image_tag）
- [ ] 6.3 AGENTS.md：中枢定论补"仅确认段进入统计/绘制"；issue 文档 §8.7 追加本 change 引用