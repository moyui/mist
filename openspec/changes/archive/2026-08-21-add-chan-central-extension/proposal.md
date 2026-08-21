## Why

**笔级中枢**（`createChannels`）与**段级中枢**（`createDuanChannels`，`add-chan-duan-channel`）均已落地
master。两者的 Phase B 都只按 `mergeSpans` 的"中枢区间（zg/zd）+ 时间"重叠合并，**残留波动区间
（gg/dd）重叠的同级中枢**——这正是缠论中的**中枢扩张**（更高级别中枢的雏形）。

缠论（29 课背驰-转折定理）：某级别**趋势** = ≥2 个依次同向、**波动区间不重叠**的同级别中枢的连接；
两个相邻同级中枢波动区间**重叠/相切**即**中枢扩张**，不再构成同级别趋势链。主线程的背驰 change
（`add-chan-divergence`）趋势链构造正需要**两两不重叠**的中枢序列（笔级/段级皆然，其"非扩张"判据
`后.dd >= 前.gg`（向上）/对称（向下）即此）。本 change 把扩张识别/处理**下沉到笔级与段级中枢
输出**：`createChannels` 与 `createDuanChannels` 都保证 phaseB 中相邻同级中枢波动区间**严格分离**
（相切也算扩张，重叠即并），为背驰趋势链提供干净输入。

## What Changes

- `ChannelCalculator.createChannels`（笔级）与 `DuanChannelCalculator.createDuanChannels`（段级）在
  现有 Phase B（延伸 + `mergeSpans` 重合合并）之后，**追加"中枢扩张归并"（Phase C）**：识别波动
  区间（gg/dd）重叠/相切的相邻同级中枢 → 合并为一个更高级别中枢，迭代到不动点收敛；输出序列保证
  **相邻中枢波动区间严格分离**（`max(dd) > min(gg)`）。
- 新增 internal 纯函数（**不 export barrel**）：
  - `isCentralExpansion`：`max(prev.dd, next.dd) <= min(prev.gg, next.gg)`（**相切也算扩张**，
    29 课"触及即扩张"），经最小结构接口 `{dd, gg}` 笔级/段级通吃；
  - `resolveCentralExpansions<T>(channels, mergeTwo)`：相邻对固定点归并驱动（复用 span-merge 的
    "共享驱动 + 注入领域操作"模式，但**不复用 mergeSpans**——其"任意 span + envelope"多段语义不匹配
    相邻对扩张）；
  - `mergeDuanCentralExpansion` / `mergeBiCentralExpansion`：按级注入的合并几何——波动重叠区
    `zd=max(dd)`、`zg=min(gg)` + 并集极值 `dd/gg`；笔级额外继承首中枢 `trend`。
- 输出契约：两阶段 `{ phaseA, phaseB }` 词义不变；phaseB 中**不存在波动区间重叠的同级中枢**。
  合并产物为**新语义中枢**：几何 ≠ 各级不变式（段级对称重叠、笔级方向性首末突破），**豁免其
  有效性约束**，显式标记 `expanded: true`。
- `ChanChannel` 与 `ChanDuanChannel` 增补 `readonly expanded: boolean`（必需字段：普通 false /
  扩张合并 true）——D3 定案；app 侧 `ChannelVo`/`DuanChannelVo`/mapper 同步透出。
- `algorithmVersion` **升为 2**（D6 定案）：笔级 `createChannels` 为已定型、被 full-output fingerprint
  锁定的 shipped 算法，live spec 硬规则要求语义变化升版本；同 change 内更新并说明 fingerprint。
- 单测：扩张识别（重叠/相切/穿越/不重叠）、合并几何（笔/段）、不动点、严格分离不变式（全部相邻对
  `max(dd) > min(gg)`）、位置递进保持、与原 mergeChannels 输出对比回归、fingerprint re-baseline。
- 真实数据验证（scratch）：600519 笔级与段级中枢扩张合并人工核对。
- **不做**：买卖点、背驰判定本身、持久化、migration、改 `mergeK/findFenxings/createBi/createDuan`
  输出、改 Phase A 枚举、新增 HTTP 端点。

## Capabilities

### New Capabilities

- `chan-central-extension`：定义笔级 + 段级中枢扩张识别与合并的纯函数契约、合并几何语义（波动重叠区
  + 各级不变式豁免）、`expanded` 标记与"输出相邻严格分离"保证。

### Modified Capabilities

- `chan-analysis-core`：`createChannels` 与 `createDuanChannels` 输出增加"相邻中枢波动区间不重叠"保证
  场景；`algorithmVersion` 从 1 升为 2（facade 语义变化，同 change 更新 fingerprint）。

## Impact

- **`mist`**：`libs/chancore` 笔级 + 段级扩张归并（internal 纯函数 + 两个 calculator 组装）、
  `ChanChannel`/`ChanDuanChannel` 加 `expanded` 字段、`apps/mist/src/chan` VO/mapper 同步（
  `channel.vo.ts`/`duan-channel.vo.ts`/`toChannelVo`/`toDuanChannelVo`）；pure 单测 +
  characterization re-baseline + scratch 验证。
- **characterization**：`chan-full-output.characterization.spec.ts` 的 SHA 随 `algorithmVersion`
  (1→2，在 fingerprint payload 内) 与行为变化而更新——**专项评审，不静默更新**；扩展一个笔级扩张
  case 固化。
- **add-chan-divergence**（主线程，未落地）：趋势链"非扩张"判据改为**依赖本 change 的不重叠输出**
  （笔级/段级皆可依赖）——其 `hasExpansion` 判定可简化/移除，仅保留**位置递进**；两 change 的
  design/tasks 互相引用（本 change 先落地）。
- **HTTP**：`/v1/chan/channel` 与 `/v1/chan/duan-channel` 输出行为随 `createChannels`/
  `createDuanChannels` 改变（扩张组合不再输出为重叠同级中枢），契约形状不变（仍两阶段数组）。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **现有算法**：`mergeK/findFenxings/createBi/createDuan` 输出不变；`createChannels` 仅对波动重叠的
  相邻中枢行为变化（无运行时消费者直接依赖中枢序列，仅 chan HTTP 端点）。
- **后续依赖**：背驰（消费不重叠中枢）、买卖点（依赖段+中枢+背驰）。
