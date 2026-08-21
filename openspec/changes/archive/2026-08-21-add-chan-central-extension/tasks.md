## 1. 范围与契约门禁

- [ ] 1.1 确认本 change 交付**笔级 + 段级**中枢扩张归并（相邻波动区间重叠/相切 → 合并为更高级别
  中枢+`expanded` 标记）；不做买卖点、背驰、持久化、migration、改 `mergeK/findFenxings/createBi/
  createDuan`、改 Phase A、新增 HTTP 端点。
- [ ] 1.2 逐条确认 design.md 门禁点 D1–D9（判定谓词、合并形态、expanded 双字段、共用 Phase C 驱动、
  笔+段范围、algorithmVersion=2、命名、capability、与 add-chan-divergence 耦合），确认后才进实施
  计划（已完成：D1–D9 用户 08-20 拍板）。
- [ ] 1.3 确认合并产物几何 = **波动重叠区**（`zd=max(dd)`、`zg=min(gg)` + 并集 `dd/gg`），**豁免**
  各级不变式（段级对称重叠 / 笔级方向性首末突破），靠 `expanded: true` 区分（design §2.2）。
- [ ] 1.4 确认 `createChannels` 与 `createDuanChannels` 输出保证：phaseB 全部**相邻对**波动区间
  **严格分离**（`max(prev.dd,next.dd) > min(prev.gg,next.gg)`，相切也扩张）。
- [ ] 1.5 确认 **`ChanCore.algorithmVersion` 1 → 2** + full-output fingerprint 同 change 更新并解释
  （专项评审，不静默）。
- [ ] 1.6 确认与 add-chan-divergence 的耦合：本 change 先落地；divergence 的 `hasExpansion` 判据
  简化/移除改依赖本不重叠输出；两 change design/tasks 互相引用。

## 2. Contracts（library-owned 类型）

- [ ] 2.1 `contracts.ts`：`ChanChannel` 与 `ChanDuanChannel` 各增 `readonly expanded: boolean`（必需；
  普通 false / 扩张合并 true）。
- [ ] 2.2 barrel `src/index.ts` 无需改动（两个接口已导出）；不导出 internal 谓词/合并函数。

## 3. 扩张归并算法（internal，共用驱动 + 按级注入）

- [ ] 3.1 新增 `internal/central-expansion.ts`：
  - `export interface CentralRangeItem { readonly dd: number; readonly gg: number; }`
  - `isCentralExpansion(prev: CentralRangeItem, next: CentralRangeItem): boolean`
    （`max(dd) <= min(gg)`，相切也算）；
  - `resolveCentralExpansions<T extends CentralRangeItem>(channels: readonly T[],
    mergeTwo: (head: T, tail: T) => T): T[]`（相邻对固定点，最左优先；返回严格分离序列）；
  - `mergeBiCentralExpansion(prev: ChanChannel, next: ChanChannel): ChanChannel`
    （union bis 去重 + 波动重叠区 + `trend=prev.trend` + `level=Bi` + `expanded=true`）；
  - `mergeDuanCentralExpansion(prev: ChanDuanChannel, next: ChanDuanChannel): ChanDuanChannel`
    （union duans 去重 + 波动重叠区 + `expanded=true`，无 trend）。
- [ ] 3.2 `internal/channel.ts`：`createChannels` 在 `mergeChannels` 后追加
  `resolveCentralExpansions(merged, mergeBiCentralExpansion)`；`detectChannel`/
  `buildChannelFromBis`/`mergeTwoChannels` 三处构造点补 `expanded: false`。
- [ ] 3.3 `internal/duan-channel.ts`：`createDuanChannels` 在 `mergeChannels` 后追加
  `resolveCentralExpansions(merged, mergeDuanCentralExpansion)`；`detectChannel`/
  `buildChannelFromDuans`/`mergeTwoChannels` 三处构造点补 `expanded: false`。
- [ ] 3.4 `ChanCore.algorithmVersion` 1 → 2（`chan-core.ts`）。

## 4. App 层（VO/mapper）

- [ ] 4.1 `channel.vo.ts` + `chan-core.mapper.ts toChannelVo`：`ChannelVo` 加
  `@ApiProperty() expanded!: boolean;` 并透出 `expanded: channel.expanded`。
- [ ] 4.2 `duan-channel.vo.ts` + `toDuanChannelVo`：同款加 `expanded` 并透出。
- [ ] 4.3 `chan-core.mapper.spec.ts`：两处字面量（channel ~L110、duanChannel ~L216）补 `expanded:
  false` + 断言 `vo.expanded === false`。
- [ ] 4.4 OpenAPI schema 随 `@ApiProperty` 自动更新（`chan.controller.openapi.spec.ts` 为 master
  预存失败，忽略）。

## 5. 验证与交付

- [ ] 5.1 pure 单测 `internal/central-expansion.spec.ts`（笔+段）：
  - 扩张识别：重叠/相切(=扩张，zg==zd 退化)/穿越/不重叠；最小接口对笔级、段级均生效；
  - 合并几何：笔级 union bis + trend 继承 + level=Bi；段级 union duans；波动重叠区 zd/zg + 并集 dd/gg；
  - 不动点：链式三中枢 → 1 个 expanded；扩张对+独立中枢 → 2（1 expanded + 1 普通 expanded:false）；
  - 严格分离不变式：全部相邻对 `max(dd) > min(gg)`；
  - 位置递进保持：不相交且递进的两中枢不误并；
  - 非扩张输入 phaseB 不变回归；确定性、不变异、空输入。
- [ ] 5.2 回归：`channel.spec.ts`、`duan-channel.spec.ts`、`chan-core.spec.ts` 既有断言补
  `expanded:false`；`mergeK/findFenxings/createBi/createDuan` 五方法输出不变。
- [ ] 5.3 **characterization re-baseline（专项评审）**：
  `chan-full-output.characterization.spec.ts` 因 `algorithmVersion`(1→2，在 payload) 变化更新 SHA；
  **扩展一个笔级扩张 case**（两相邻波动重叠中枢 → 归并为一个 expanded）固化并解释；不静默更新。
- [ ] 5.4 真实数据 scratch（600519 日 K）：笔级 + 段级 phaseB 扩张归并人工核对（对照价格走势/波动
  区间），不固化、核对后删除。
- [ ] 5.5 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker /
  `openspec validate --all --strict`。
- [ ] 5.6 检索 `libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import；未恢复 Chan
  persistence。
- [ ] 5.7 更新 add-chan-divergence 的 design/tasks 交叉引用（本 change 先于它落地）；向主线程交付
  验证证据后归档。
