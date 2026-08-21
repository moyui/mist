# 实施计划 — add-chan-buy-sell-point（代码级落地细节）

> 三步工作流第二步产物（普通 markdown，非 openspec 格式）。
> 对应 spec：`openspec/changes/add-chan-buy-sell-point/`（proposal/design/tasks/specs 已确认）。
> 本计划只写"怎么落地"，确认后才建 worktree 写码。

## 0. 前置分析：背驰实现是否需要修改（已确认：不需要）

- 项目**无独立"背离"实现**（全 libs 搜索仅 divergence 背驰；force.ts 中"背离"为注释）。
- 一类买卖点**只消费** `DivergenceDetector` 输出中 `type === Trend` 的结果（链末中枢 A vs C
  双口径，与第24课标准背驰一致）；`Consolidation`（盘整背驰）**被买卖点过滤**（用户 D3
  定调：不产一类点），但 `detectDivergences` 本身保持原输出、不改。
- 二类/三类不消费背驰（纯结构/几何），不影响。
- `ChanBspUnit` 是 `ChanDivergenceUnit` 结构超集 → `ChanBspInput.units` 可直接构造
  `ChanDivergenceInput`（TS 结构类型成立，无需映射函数）。

## 1. 文件级改动

| 文件 | 动作 | 内容 |
|------|------|------|
| `libs/chancore/src/contracts.ts` | 修改 | 追加 `ChanBspType` / `ChanBspUnit` / `ChanBspInput` / `ChanBuySellPoint`（背驰类型之后） |
| `libs/chancore/src/internal/buy-sell-point.ts` | **新增** | `BuySellPointDetector`（一类/二类/三类 + 排序 + firstTypeIndex） |
| `libs/chancore/src/internal/buy-sell-point.spec.ts` | **新增** | 纯单测（用例见 §5） |
| `libs/chancore/src/chan-core.ts` | 修改 | facade 增加 `detectBuySellPoints`；import `BuySellPointDetector` + 新类型 |
| `libs/chancore/src/index.ts` | 修改 | 枚举导出 `ChanBspType`；类型导出 `ChanBspUnit`/`ChanBspInput`/`ChanBuySellPoint` |
| `libs/chancore/src/chan-core.spec.ts` | 修改 | 公共 API 精确 key 断言追加 `'ChanBspType'`；空输入用例追加 `detectBuySellPoints` |

不动：`internal/divergence.ts`、`internal/channel.ts`、`internal/duan-*.ts`、`libs/indicators`、app 层、HTTP 契约。

## 2. 契约类型（contracts.ts 追加，位于 ChanDivergence 区块之后）

```ts
/** 买卖点类型（对应缠论第一/二/三类买卖点，买卖对称）。 */
export enum ChanBspType {
  FirstBuy = 'first_buy',
  FirstSell = 'first_sell',
  SecondBuy = 'second_buy',
  SecondSell = 'second_sell',
  ThirdBuy = 'third_buy',
  ThirdSell = 'third_sell',
}

/** 买卖点单元（笔或段皆可，最小结构接口）——背驰 unit 超集：价格比较需要 high/low。 */
export interface ChanBspUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;   // 段内最高价
  readonly low: number;    // 段内最低价
  readonly trend: TrendDirection;
}

/** 买卖点判定入参：units 与 forces 按索引一一对齐；zhongshus 复用背驰最小接口。 */
export interface ChanBspInput {
  readonly units: readonly ChanBspUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[];  // 空数组 → 一类不输出；二三类照常
}

/** 买卖点输出。 */
export interface ChanBuySellPoint {
  readonly type: ChanBspType;
  readonly zhongshuIndex: number | null;  // 一类/三类：相关中枢下标；二类：恒 null
  readonly unitIndex: number;             // 确认段下标（一类=离开段；二三类=回抽段），点位于段末端
  readonly price: number;                 // 买=确认段 low、卖=确认段 high
  readonly firstTypeIndex: number | null; // 同向最近前置一类点在结果数组中的下标；无 → null
}
```

## 3. 算法实现（internal/buy-sell-point.ts）

```ts
export class BuySellPointDetector {
  detectBuySellPoints(input: ChanBspInput): ChanBuySellPoint[] {
    // 0. units 为空 → []
    // 1. 【一类】内部构造 ChanDivergenceInput（units 直接结构赋值 + zhongshus/forces 透传），
    //    调 new DivergenceDetector().detectDivergences(...)：
    //    - 只消费 type === ChanDivergenceType.Trend 的结果（Consolidation 过滤）
    //    - 每条 Trend → 一个点：
    //      leaveTrend = units[div.leaveIndex].trend
    //      type = leaveTrend === Down ? FirstBuy : (Up ? FirstSell : 跳过)
    //      zhongshuIndex = div.zhongshuIndex; unitIndex = div.leaveIndex
    //      price = FirstBuy ? units[leaveIndex].low : units[leaveIndex].high
    // 2. 【二类】扫描 i ∈ [0, units.length-3]，前置：i 必须是一类点确认段（一类点 unitIndex === i）：
    //    a=units[i]; b=units[i+1]; c=units[i+2]
    //    a.down && b.up && c.down && c.low > a.low  → { SecondBuy,  null, i+2, c.low }
    //    a.up && b.down && c.up && c.high < a.high  → { SecondSell, null, i+2, c.high }
    //    （严格比较无 epsilon；不检查背驰/力度）
    // 3. 【三类】对每个已定位中枢（firstUnitTime/lastUnitTime 精确匹配 units，找不到跳过）：
    //    s = 首单元下标、e = 末单元下标；leave = e+1、pull = e+2
    //    leave/pull 越界 → 跳过
    //    L=units[leave]; P=units[pull]
    //    L.up && P.down && P.low > span.zg  → { ThirdBuy,  span.zhongshuIndex, pull, P.low }
    //    L.down && P.up && P.high < span.zd → { ThirdSell, span.zhongshuIndex, pull, P.high }
    //    （严格：贴边 == zg/zd 不算——用户定案，中心定理一依据）
    // 4. 排序：unitIndex 升序 → type（枚举声明序）升序 → zhongshuIndex 升序（null 后置）
    // 5. 回填 firstTypeIndex：对每个二/三类点，在同向（buy/sell）一类点中找 unitIndex 最大的
    //    前置者，取其排序后结果数组下标；无 → null（一趟扫描）
    // 6. 返回；输入不变异；确定性
  }
}
```

实现要点：
- 中枢定位逻辑与背驰 `locateSpans` 同法（按 firstUnitTime/lastUnitTime 毫秒精确匹配），
  独立实现一份（不导出 DivergenceDetector 的私有方法）；找不到跳过、不臆断。
- 排序用稳定比较器；`firstTypeIndex` 在**排序后**回填（依赖最终下标）。
- 不 import 任何指标库/Nest/IO；只读输入。
- 时间顺序：一类在前（先算，供二类前置判断），但最终输出统一排序。

## 4. Facade 与 barrel

```ts
// chan-core.ts（detectDivergences 之后）
static detectBuySellPoints(input: ChanBspInput): readonly ChanBuySellPoint[] {
  return new BuySellPointDetector().detectBuySellPoints(input);
}
```

```ts
// index.ts
// 枚举导出追加：ChanBspType
// 类型导出追加：ChanBspUnit、ChanBspInput、ChanBuySellPoint
```

## 5. 测试用例（internal/buy-sell-point.spec.ts，仿 divergence.spec.ts 模式）

fixture helpers：`makeBspUnit(trend, index, high, low)`（时间 = 2026-07-01 09:00 + i*10min）、
`makeBspAlternatingUnits(count, highs?, lows?)`、`makeBspZhongshu(firstUnitTime, lastUnitTime, gg, dd, zg, zd)`、
`makeBspForce(area, peak)`、`makeBspTrendDownInput()`（下跌趋势链 → Trend 背驰 → 一买）等。

**一类**
1. 下跌趋势链（≥2 中枢、链末 Trend 背驰）→ 产出 FirstBuy（unitIndex=leaveIndex、price=该段 low）
2. 上涨趋势链 → FirstSell（price=该段 high）
3. 仅盘整背驰（Consolidation，无 Trend）→ 不产一类点
4. Trend 与 Consolidation 并存同中枢 → 只产一个一类点（Trend）
5. forces 为空 → 无一类点（二三类照常）
6. 方向 None 的离开段不计

**二类**
7. 标准二买：一买段(i=down) → up → down 且 c.low > a.low → SecondBuy at i+2（price=c.low、zhongshuIndex=null）
8. 标准二卖：对称
9. **无前置一买**（三元组结构满足但 i 不是一类点确认段）→ 不产二买
10. 严格口径：c.low == a.low → 不产
11. 非相邻三元组不输出（间隔段）
12. 方向不交替（down/down/down）→ 不产

**三类**
13. 标准三买：中枢 [u1,u2,u3]、离开 u4 up、回抽 u5 down 且 u5.low > zg → ThirdBuy at 5（price=u5.low、zhongshuIndex=0）
14. 标准三卖：对称（u5.high < zd）
15. **贴边**：u5.low == zg → 不产（严格口径）
16. 无离开段（e+1 越界）→ 跳过
17. 无回抽段（e+2 越界）→ 跳过
18. 离开段反向（u4 down + u5 up）→ 不产三买
19. 中枢定位失败（firstUnitTime 不匹配）→ 跳过不产

**汇总**
20. 排序：unitIndex → type → zhongshuIndex（null 后置）
21. firstTypeIndex 回填：二买引用最近前置一买；无 → null
22. 确定性（重复调用 toEqual）；不变异（JSON.stringify 前后比对）
23. 空输入（units: []）→ []

**chan-core.spec.ts 更新**
24. 公共 API 精确 key 断言追加 `'ChanBspType'`；`algorithmVersion` 仍 2；`analyze` 仍不存在
25. 空输入用例追加 `ChanCore.detectBuySellPoints({ units: [], zhongshus: [], forces: [] })` → `[]`

## 6. 验证命令（mist 仓，pnpm）

```bash
# 单测（chancore 全量）
npx jest libs/chancore --runInBand --watchman=false --forceExit
# lint / typecheck
pnpm lint:check
pnpm typecheck
# openspec 校验（spec 不受影响，回归确认）
openspec validate --all --strict
```

验收基线（对齐 tasks.md 6.3/6.4）：
- chancore 单测全绿（含新增 ~25 用例 + 既有 87+ 用例）
- lint:check / typecheck 通过
- `libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import（boundary guard 自动覆盖）
- `algorithmVersion` 保持 2；`detectDivergences` 契约无变化；HTTP 契约无变化

## 7. 落地步骤（三步工作流第三步）

1. 建 worktree：`git -C /Users/moyui/sean/mist/mist worktree add .worktrees/add-chan-buy-sell-point -b feat/add-chan-buy-sell-point`
   + `ln -s ../../node_modules .worktrees/add-chan-buy-sell-point/node_modules`
2. 按 §1-§4 写码 + §5 单测
3. §6 验证全绿
4. 真实数据 scratch 验证（600519 日 K → 全链路 → detectBuySellPoints 人工核对，不入库）
5. 审阅 evidence → 合 master（个人项目直接合）→ gh CLI HTTPS 推送 → 归档 change
