## 1. 建立完整真实数据红灯边界

- [x] 1.1 将完整沪深300 388 根和完整上证指数 386 根合并 K 保存为后端仓库内的规范 fixture，并为两个数据集复用同一加载与结构断言 helper。
- [x] 1.2 新增完整沪深300 Phase A 完整性测试，输出重叠索引范围并锁定 `206 -> 302` / `222 -> 228` 见证；在修改生产代码前运行旧双数组实现，记录符合预期的 RED 失败。
- [x] 1.3 新增完整上证指数回测测试，锁定 Phase A/Phase B 数量以及 `142 -> 146`、`142 -> 195`、`266 -> 317` 三个关键区间。

## 2. 独立测试和实现 Phase A helper

- [x] 2.1 新增 `bi-phase-a-time-stack.helper.spec.ts` 红灯测试，覆盖连续多次栈顶归约、三笔全 Valid 停止、含 Invalid 但不可合并停止、合并产物重新判定和 leading Invalid 保留。
- [x] 2.2 在独立 helper 测试中覆盖输入不可变、候选入栈不连续、栈顶三笔不连续和错误信息包含索引范围。
- [x] 2.3 新增 `bi-phase-a-time-stack.helper.ts`，导出 `PhaseATimeStackOperations` 与 `reducePhaseATimeStack`，实现单栈循环归约且不依赖 NestJS。
- [x] 2.4 只运行 Phase A helper 测试并确认全部通过；在此步骤完成前不修改 `BiService` 的 Phase A 生产路径。

## 3. 在 BiService 中组合 Phase A 与 Phase B

- [x] 3.1 使用箭头函数 operations 把 `BiService` 的三笔原语与 `data` 闭包传给 `reducePhaseATimeStack`，再沿用现有 unfinished-tail 构建。
- [x] 3.2 删除 `BiSourceTag`、confirmed/pending 双数组、跨数组取尾、来源相关删除和最终 Complete Bi 排序逻辑。
- [x] 3.3 保持 `bi-phase-a-time-stack.helper.ts` 与 `bi-phase-b-merge.helper.ts` 相互独立，由 `BiService.getBi` 依次组合两个 helper。
- [x] 3.4 保持 `{ phaseA, phaseB }`、HTTP 返回、`mergeBiSegments` operations 和 Channel 使用 Phase B 的行为不变。

## 4. 验证后端真实数据与既有契约

- [x] 4.1 运行完整沪深300回归，确认 Complete Bi 连续、valid 无重叠、旧重叠见证消失且不存在仍可三笔归约的相邻结构。
- [x] 4.2 运行完整上证指数回归，确认 Phase A 为 35 笔、Phase B 为 25 笔，并命中三个关键索引区间。
- [x] 4.3 运行 `npx jest --runInBand --watchman=false --testPathPattern="bi-merge-cases"`，确认原上证指数两个裁剪场景 6/6 通过。
- [x] 4.4 运行 `npx jest --runInBand --watchman=false --testPathPattern="bi-phase-a-time-stack|bi-phase-b-merge|bi.service.spec|channel.service.spec"`。
- [x] 4.5 在后端运行 `pnpm run typecheck`、`pnpm run lint:check` 和 `pnpm run test:ci`。

## 5. 刷新并检查前端阶段快照

- [x] 5.1 后端验证全部通过后，在 `mist-fe` 运行 `pnpm run snapshots:generate`，审核沪深300、上证指数、创业板和贵州茅台的 Phase A/Phase B 数量变化。
- [x] 5.2 在 `mist-fe` 运行 `pnpm run typecheck`、`pnpm run lint` 和 `pnpm run test:ci`。
- [x] 5.3 在 `/chan-tests` 检查四个完整数据集，确认 Phase A 重叠消失；如 Phase B 仍存在结构连续但跨度较长的笔，只记录为后续 change，不在本次修改 Phase B。

## 6. 校验与交付

- [x] 6.1 运行 `openspec validate refactor-chan-phase-a-time-stack --strict`，并记录 helper 独立验证、服务集成、完整真实数据和页面检查证据。
- [x] 6.2 审查最终 diff，确认路线图、BigQMT 和已归档预览等无关工作未被修改，并确认 Phase A helper、BiService 集成和前端快照是可独立回退的边界。

## 7. 最终内联收口

- [x] 7.1 重开 OpenSpec，记录“独立 helper 先验证、稳定后内联 `BiService`”的最终设计与零快照变化约束。
- [x] 7.2 内联 Phase A 时间栈，迁移 7 个 helper 测试场景为 service-phase 测试并删除 Phase A helper 源文件。
- [x] 7.3 内联 Phase B invalid 区间归约，迁移 9 个 helper 测试场景为 service-phase 测试并删除 Phase B helper 源文件。
- [x] 7.4 运行后端、前端、OpenSpec 与差异检查，记录最终证据；change 保持未归档。
