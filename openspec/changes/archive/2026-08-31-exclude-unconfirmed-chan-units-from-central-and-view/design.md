# Design: exclude-unconfirmed-chan-units-from-central-and-view

## 1. 过滤点定位

### 1.1 段级中枢（`libs/chancore/src/internal/duan-channel.ts`）

`createDuanChannels`（28 行起）入口处过滤：

```ts
createDuanChannels(
  duans: readonly ChanDuan[],
): ChanDuanChannelTwoPhaseResult {
  // 未确认/无效段（status !== Valid；现时 = UnComplete 尾段 endBi===null）不进入中枢统计：
  // 其边界待定，参与中枢几何无客观性（用户规则 + 18 课"都是完成的才构成中枢"）。
  // 统一 status 判据（非 endBi===null 判据）：未来若段增加 Invalid 类别自动免疫。
  // 数据层 createDuan 输出保持不变。
  const confirmed = duans.filter((d) => d.status === DuanStatus.Valid);
  const phaseA = this.enumerateChannels(confirmed);
  const merged = this.mergeChannels(phaseA, confirmed);
  const phaseB = resolveCentralExpansions(merged, mergeDuanCentralExpansion);
  return { phaseA, phaseB };
}
```

- 过滤在入口一次性完成；`enumerateChannels` / `mergeChannels` / `resolveCentralExpansions`
  的函数体零改动（输入已确认）；
- 空确认集时 `confirmed=[]` → `enumerateChannels([])` 返回空 → 输出 `{ phaseA: [], phaseB: [] }`
  （与"空输入"场景一致）；
- **笔级中枢不改**：实证 `createChannels` 全量 vs 剔除尾笔输出一致（尾笔无法完成三笔重叠），
  已等价于规则；为其增加显式过滤反而引入不必要的行为回归面。

### 1.1b 笔级中枢过滤（`libs/chancore/src/internal/channel.ts`）

`createChannels` 入口显式过滤（实测全量 vs 剔除 invalid 输出一致——当前数据 invalid/unknown 笔
恰好无法完成三笔重叠；显式化使该性质由代码保证而非数据偶然）：

```ts
createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
  const confirmed = data.filter((b) => b.status === BiStatus.Valid); // 新增：invalid/未知不构成中枢
  const phaseA = this.enumerateChannels(confirmed);
  const merged = this.mergeChannels(phaseA, confirmed);
  const phaseB = resolveCentralExpansions(merged, mergeBiCentralExpansion);
  return { phaseA, phaseB };
}
```

### 1.2 笔层与可视化过滤（visual + 买卖点 bi 分支）

现状调查（全量 2832/3888 根，master）：

| 数据源 | 笔总数 | Invalid | Unknown（未完成尾笔） | Invalid 所在位置 |
|--------|--------|---------|----------------------|------------------|
| qmt | 158 | 1 | 1 | 08-21 14:35→15:00（尾部） |
| tdx | 232 | 4 | 1 | 05-06 开头 2 根 + 08-27 14:05~15:00 尾部 2 根 |

- **Invalid 笔不进入笔级中枢**（实测全量 vs 剔除输出一致：invalid/未知尾笔无法完成三笔重叠）；
- **Invalid 笔不进入段**（实测 createDuan 的 Complete 段不含 invalid 笔——invalid 均落"开头丢弃
  （findValidSegmentStart）/末尾未完成"惰性区；此性质以回归断言锁定）；
- **真正被污染的是消费端**：
  - `chan-visual.adapter.ts`：无 status 过滤 → invalid 笔（如 tdx bi#230 08-27 14:05→14:15）与 unknown
    尾笔被画（用户看到"不应存在的笔结构"）；
  - `chan-bsp.pipeline.ts` `units='bi'` 分支：`units = phaseB.map(toBspUnit)` 直取全量 → invalid/unknown
    进入 bi 级买卖点。

实现：

```ts
// chan-visual.adapter.ts 笔渲染：非确认且有效不画
if (bi.status !== BiStatus.Valid) continue;

// chan-visual.adapter.ts 段渲染：非确认且有效段不画（统一 status 判据，替换
// endBi ?? originBis[last] 兜底；现时 status=Unknown ⇔ endBi===null，由断言锁定等价）
if (duan.status !== DuanStatus.Valid) continue;

// chan-bsp.pipeline.ts units='bi' 分支（现有 `units = phaseB.map(toBspUnit);` 前过滤）
units = phaseB.filter((b) => b.status === BiStatus.Valid).map(toBspUnit);
```

`duan` 分支：units 为段（无 invalid 污染，实测），`zhongshus` 经 §1.1 过滤干净——不改。

中枢渲染防御（展示层最后防线，即使 chancore 计算链已保证）：

```ts
// chan-visual.adapter.ts 中枢渲染：构成单元含非确认且有效单元 → 不画（笔中枢/段中枢一致）
// （chancore 已保证输出干净；此处为防御性校验，防旧版本/外部数据直连）
if (channel 的构成单元含 status !== Valid 的笔或段) continue;
```

- 段级中枢经 §1.1 过滤后天然只含确认段，adapter 无需额外中枢过滤（防御校验保留）；
- 确认的段/笔/中枢绘制逻辑不变。

## 2. 连锁影响（必须知会）

- **段中枢输出变化**：`chan-bsp.pipeline.ts:47` 以 `createDuanChannels(duans).phaseB` 构造
  `zhongshus` 输入 → 买卖点输入随之变化（尾段此前参与的中枢不再出现/几何变化）。买卖点
  **代码不改**（用户拍板暂缓），但其输出变化是本改动的**预期连锁**；
- 段中枢消费方：回测（backtest）、signal（chan-bsp pipeline）、前端可视化——输出口径统一
  变为"仅确认结构"；
- `algorithmVersion` 5 → 6 让消费方可按版本区分新旧口径。

## 3. 版本与快照

| 文件 | 改动 |
|------|------|
| `chan-core.ts` | `algorithmVersion` 5 → 6（注释补口径说明） |
| `chan-core.spec.ts:25` | `toBe(5)` → `toBe(6)` |
| `chan-full-output.characterization.spec.ts` | 2 处 payload `algorithmVersion: 5` → `6`；`EXPECTED_FULL_OUTPUT_SHA256` / `EXPECTED_DUAN_EXPANSION_SHA256` 重算回填（主管道不含 duan，仅 payload 版本字段变化；duan-expansion fixture 输入全 Complete，过滤不影响其输出——SHA 变化仅来自 payload 版本字段） |

## 4. 单测

`duan-channel.spec.ts` 新增（复用现有 `makeDuan` 风格）：

```ts
it('excludes an unconfirmed tail Duan from Duan-level Channel derivation', () => {
  const confirmed = [...];        // 现有 Complete 段构造
  const tail: ChanDuan = makeDuan({ ..., type: DuanType.UnComplete, endBi: null });
  const full = new DuanChannelCalculator().createDuanChannels([...confirmed, tail]);
  const trimmed = new DuanChannelCalculator().createDuanChannels(confirmed);
  expect(full.phaseA).toEqual(trimmed.phaseA);
  expect(full.phaseB).toEqual(trimmed.phaseB);
});
```

- 既有用例（输入全 Complete）回归不受影响（实证断言）；
- 若现有 `makeDuan` 不产生 UnComplete 段，为用例补充尾段构造（仅测试文件）。

## 5. 验证命令（worktree 内）

```bash
node_modules/.bin/jest --watchman=false libs/chancore --runInBand --forceExit
node_modules/.bin/jest --watchman=false libs/visual-command --runInBand --forceExit
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint "libs/chancore/src/**/*.ts" "libs/visual-command/src/**/*.ts"
/Users/moyui/Library/pnpm/bin/openspec validate exclude-unconfirmed-chan-units-from-central-and-view
```

复现对照：`/tmp/duan-repro/check-uncomplete-consumption.ts` 在修复后应输出
`段中枢：全量=剔尾段、输出一致? true`。