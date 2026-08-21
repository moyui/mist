# 实施计划 — add-chan-central-extension（笔级 + 段级中枢扩张）

> 三步工作流第二步。代码级实施计划，非 openspec 产物。spec 见同目录 proposal/design/tasks/specs。
> 落地（写码）须经用户确认本计划后才开始（第三步）。

## 0. 规范遵循

- 严格按 `mist/docs/project-quality-governance-guide.md` 与本 change 的 spec delta 实施。
- ChanCore **纯增量**：不改 `mergeK/findFenxings/createBi/createDuan` 输出；**不改 Phase A 枚举**；
  不引入 TypeORM/Redis/HTTP/Nest/env 依赖进 `libs/chancore`；不恢复 Chan persistence。
- **笔级 `channel.ts` 解除冻结**（用户 08-20 拍板，仅限 Phase C 后置 pass + 3 处构造点 `expanded:false`；
  方向性几何、Phase A、既有延伸/合并不动）。
- **D1 相切也算扩张**：`isCentralExpansion = max(prev.dd, next.dd) <= min(prev.gg, next.gg)`，
  经最小接口 `{dd,gg}` 笔/段通吃。
- **D2/D3 几何合并 + 显式标记**：`ChanChannel` 与 `ChanDuanChannel` 都加必需 `expanded: boolean`；
  合并产物 `expanded: true`，几何 = **波动重叠区** `zd=max(dd)`、`zg=min(gg)` + 并集极值 `dd/gg`
  （**非各级不变式**——union 重算在扩张下必无效，design §2.2），**豁免**段级对称重叠 / 笔级方向性
  首末突破的有效性约束。
- **D4 共用后置 Phase C**:`resolveCentralExpansions(channels, mergeTwo)` 相邻对固定点驱动，
  **不复用 mergeSpans**（多段+envelope 语义不匹配相邻对扩张），沿用"共享驱动+注入领域操作"哲学。
- **D6 `algorithmVersion` 1 → 2**；新增 internal 不从 barrel 导出。

## 1. 分支与 worktree

- 建 worktree `mist/.worktrees/feat-add-chan-central-extension`，分支 `feat/add-chan-central-extension`，
  基于当前 master（`f139d87d`）。
- 新 worktree 缺 node_modules 时 `ln -s ../../node_modules node_modules`（见记忆）。
- 命令用 `node -e "process.chdir('...'); execSync('...')"` 模式（避免 cd 权限提示）；包管理用 `pnpm`。
- 推送用 gh credential + `origin-https`。

## 2. 改动文件总览

| 仓库/目录 | 文件 | 动作 |
|---|---|---|
| libs/chancore/src | `contracts.ts` | `ChanChannel` 与 `ChanDuanChannel` 各加 `readonly expanded: boolean` |
| libs/chancore/src/internal | `central-expansion.ts` | **新增**：`CentralRangeItem`/`isCentralExpansion`/`resolveCentralExpansions`/`mergeBiCentralExpansion`/`mergeDuanCentralExpansion` |
| libs/chancore/src/internal | `channel.ts` | `createChannels` 接 Phase C；3 处构造点补 `expanded:false` |
| libs/chancore/src/internal | `duan-channel.ts` | `createDuanChannels` 接 Phase C；3 处构造点补 `expanded:false` |
| libs/chancore/src | `chan-core.ts` | `algorithmVersion` 1 → 2 |
| libs/chancore/src/internal | `central-expansion.spec.ts` | **新增** 笔+段单测 |
| libs/chancore/src/internal | `channel.spec.ts`、`duan-channel.spec.ts` | 既有断言补 `expanded:false`（无结构性破坏） |
| libs/chancore/src | `chan-core.spec.ts` | 版本/确定性断言 |
| libs/chancore/src | `chan-full-output.characterization.spec.ts` + `fixture.ts` | **re-baseline**：版本(1→2 in payload) 更新 SHA + 扩笔级扩张 case（专项评审） |
| apps/mist/src/chan/vo | `channel.vo.ts`、`duan-channel.vo.ts` | 各加 `@ApiProperty() expanded!: boolean;` |
| apps/mist/src/chan | `chan-core.mapper.ts` | `toChannelVo`/`toDuanChannelVo` 透出 `expanded` |
| apps/mist/src/chan | `chan-core.mapper.spec.ts` | 两处字面量补 `expanded:false` + 断言 |
| openspec/changes/add-chan-central-extension/ | design/tasks | 落地后勾选 tasks |

> app 侧 `chan-analysis.types.ts` 只有 `ChanDuanChannel` 镜像（**无 `ChanChannel` 镜像**——`ChannelVo`
> 是独立 class，`ChanChannel` 直接来自 `@app/chancore`），因此只需给 `ChanDuanChannel` 镜像加
> `expanded`，`ChanChannel` 无 app 镜像要改。

## 3. contracts.ts（库侧，两接口）

```ts
export interface ChanChannel {
  readonly bis: readonly ChanBi[];
  readonly zg: number; readonly zd: number; readonly gg: number; readonly dd: number;
  readonly level: ChannelLevel; readonly type: ChannelType; readonly status: ChannelStatus;
  readonly trend: TrendDirection;          // 既有；扩张产物继承首中枢
  readonly expanded: boolean;              // 新增（必需）
  readonly startId: number; readonly endId: number;
  readonly displayStartId: number; readonly displayEndId: number;
}

export interface ChanDuanChannel {
  readonly duans: readonly ChanDuan[];
  readonly zg: number; readonly zd: number; readonly gg: number; readonly dd: number;
  readonly level: ChannelLevel; readonly type: ChannelType; readonly status: ChannelStatus;
  readonly expanded: boolean;              // 新增（必需）
  readonly startId: number; readonly endId: number;
  readonly displayStartId: number; readonly displayEndId: number;
}
```

- barrel `src/index.ts` 无需改动（两接口已导出）。

## 4. internal/central-expansion.ts（新增，纯函数）

```ts
import { ChannelLevel, ChannelStatus, ChannelType, TrendDirection } from '../contracts';
import type { ChanBi, ChanChannel, ChanDuan, ChanDuanChannel } from '../contracts';

/** 扩张判定共享最小接口（笔/段通吃，仅需波动区间极值 dd/gg）。 */
export interface CentralRangeItem {
  readonly dd: number;
  readonly gg: number;
}

/** 扩张判定（D1：相切也算扩张）。 */
export function isCentralExpansion(
  prev: CentralRangeItem,
  next: CentralRangeItem,
): boolean {
  return Math.max(prev.dd, next.dd) <= Math.min(prev.gg, next.gg);
}

/** 相邻对固定点归并：从左到右，命中即并一个并重扫；返回相邻对严格分离序列
 * （任意相邻对 max(dd) > min(gg)）。最左优先→确定性；浅克隆输入，不改调用方数组/元素。 */
export function resolveCentralExpansions<T extends CentralRangeItem>(
  channels: readonly T[],
  mergeTwo: (head: T, tail: T) => T,
): T[] {
  const result = channels.map((channel) => ({ ...channel }));
  while (true) {
    let merged = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (isCentralExpansion(result[i], result[i + 1])) {
        result[i] = mergeTwo(result[i], result[i + 1]);
        result.splice(i + 1, 1);
        merged = true;
        break;
      }
    }
    if (!merged) {
      return result;
    }
  }
}

/** 笔级扩张合并：union bis(startTime 去重) + 波动重叠区 + trend 继承首中枢 + expanded=true。 */
export function mergeBiCentralExpansion(
  prev: ChanChannel,
  next: ChanChannel,
): ChanChannel {
  return {
    bis: unionByStartTime(prev.bis, next.bis),
    zg: Math.min(prev.gg, next.gg),
    zd: Math.max(prev.dd, next.dd),
    gg: Math.max(prev.gg, next.gg),
    dd: Math.min(prev.dd, next.dd),
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    status: ChannelStatus.Valid,       // 已被判定扩张并归并
    trend: prev.trend,                 // 离开方向（mergeTwoChannels 惯例）
    expanded: true,
    startId: prev.startId,
    endId: next.endId,
    displayStartId: prev.displayStartId,
    displayEndId: next.displayEndId,
  };
}

/** 段级扩张合并：union duans(startTime 去重) + 波动重叠区 + expanded=true（无 trend）。 */
export function mergeDuanCentralExpansion(
  prev: ChanDuanChannel,
  next: ChanDuanChannel,
): ChanDuanChannel {
  return {
    duans: unionByStartTime(prev.duans, next.duans),
    zg: Math.min(prev.gg, next.gg),
    zd: Math.max(prev.dd, next.dd),
    gg: Math.max(prev.gg, next.gg),
    dd: Math.min(prev.dd, next.dd),
    level: prev.level,
    type: ChannelType.Complete,
    status: ChannelStatus.Valid,
    expanded: true,
    startId: prev.startId,
    endId: next.endId,
    displayStartId: prev.displayStartId,
    displayEndId: next.displayEndId,
  };
}

/** 按 startTime 去重合并元素序列（镜像 mergeTwoChannels 的 seen 逻辑）。 */
function unionByStartTime<T extends { startTime: Date }>(
  ...groups: readonly (readonly T[])[]
): T[] {
  const seen = new Set<number>();
  const result: T[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.startTime.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
```

- 三+ 个函数都位于新文件内、从两个 calculator 内部 import；**不 export barrel**。

## 5. 两个 calculator 接线 Phase C

```ts
// internal/channel.ts
import { resolveCentralExpansions, mergeBiCentralExpansion } from './central-expansion';

createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
  const phaseA = this.enumerateChannels(data);
  const merged = this.mergeChannels(phaseA, data);            // 不变：延伸 + 重合合并
  const phaseB = resolveCentralExpansions(merged, mergeBiCentralExpansion); // 新增 Phase C
  return { phaseA, phaseB };
}
// 3 处构造点补 expanded:false：detectChannel(~L394)、buildChannelFromBis(~L225)、mergeTwoChannels(~L515)

// internal/duan-channel.ts
import { resolveCentralExpansions, mergeDuanCentralExpansion } from './central-expansion';

createDuanChannels(duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult {
  const phaseA = this.enumerateChannels(duans);
  const merged = this.mergeChannels(phaseA, duans);           // 不变
  const phaseB = resolveCentralExpansions(merged, mergeDuanCentralExpansion); // 新增 Phase C
  return { phaseA, phaseB };
}
// 3 处构造点补 expanded:false：detectChannel(~L95)、buildChannelFromDuans(~L265)、mergeTwoChannels(~L358)
```

- `mergeChannels` 末尾 `filter(status === Valid)` 保持；Phase C 只处理 Valid 成品。
- `ChanCore.algorithmVersion`（`chan-core.ts`）`1 as const` → `2 as const`。

## 6. App 层（VO/mapper/镜像）

- `apps/mist/src/chan/types/chan-analysis.types.ts`：仅 `ChanDuanChannel` 镜像（L69-82）加
  `expanded: boolean`（放 status 后）。
- `apps/mist/src/chan/vo/channel.vo.ts`：`@ApiProperty() expanded!: boolean;`（trend 后）；
  `duan-channel.vo.ts`：`@ApiProperty() expanded!: boolean;`（status 后）。
- `chan-core.mapper.ts`：`toChannelVo`（L83）加 `expanded: channel.expanded,`；
  `toDuanChannelVo`（L118）加 `expanded: channel.expanded,`。
- OpenAPI schema 随 `@ApiProperty` 自动更新。`chan.controller.openapi.spec.ts` 为 master 预存失败，忽略。
- 无新 HTTP 端点、无路由变化。

## 7. 测试计划

### 7.1 `central-expansion.spec.ts`（新增，笔 + 段）

helper：`makeBiChannel(overrides)` / `makeDuanChannel(overrides)`（全字段，默认 `expanded:false`、
`status:Valid`；笔级 `trend:Up`）。段/笔构造复用 `duan-channel.spec.ts`/`channel.spec.ts` 的 make 模式。

- **`isCentralExpansion` 边界**：
  - 正宽度重叠：prev{dd:4,gg:11} vs next{dd:1,gg:8} → true；
  - **相切**：prev{dd:4,gg:8} vs next{dd:8,gg:12} → `8 <= 8` → true（D1）；
  - 不重叠（间隔）：prev{dd:0,gg:5} vs next{dd:6,gg:9} → false；
  - 嵌套：prev{dd:2,gg:9} vs next{dd:4,gg:6} → true；最小接口对笔级/段级对象均生效。
- **`mergeBiCentralExpansion` / `mergeDuanCentralExpansion` 几何**：
  - union 去重（共享 startTime 元素不重复）；`zg=min(gg)`/`zd=max(dd)`/`gg=max(gg)`/`dd=min(dd)`；
  - 笔级：`trend === prev.trend`、`level === Bi`；段级：无 trend 字段、`level === Duan`；
  - 两者 `expanded === true`、`status=Valid`、`type=Complete`；
  - 相切退化：prev{dd:4,gg:8} vs next{dd:8,gg:12} → `zg===zd===8` 仍 `expanded:true`；
  - 边界 ID prev 首 / next 末；不变异（入参数组/对象不被改）。
- **`resolveCentralExpansions`（笔/段各跑一组）**：
  - 链式重叠 Z1..Z3 两两相邻重叠 → 归并为 1 个 expanded；
  - 扩张对 + 后续独立正常中枢 → 2（1 expanded + 1 普通 expanded:false）；
  - **严格分离不变式**：任意构造（含随机）执行后，全部相邻对 `max(dd) > min(gg)`；
  - 确定性、输入不改。
- **集成走 facade**：
  - 段级 6 段 fixture（design §2.2 的 [10,20]/[5,15] 扩张数值化构造 duans）→ `createDuanChannels`
    phaseB 收敛为 1 个 expanded；phaseA 仍原始候选；
  - 笔级：构造 10+ 笔序列（Phase A 5 笔滑窗产出两个相邻波动重叠中枢）→ `createChannels` phaseB
    收敛为 1 个 expanded（trend 继承）；
  - 位置递进保持：不相交且递进两中枢不误并（笔/段各一）；
  - 空输入 `{phaseA:[],phaseB:[]}`；`ChanCore.algorithmVersion === 2`。

> 若集成 fixture 的 phaseA/phaseB 枚举形状与预期不符：以"直接构造 + `resolveCentralExpansions`"
> 单测为主（顺序/几何既定），关联断言改验证"不变式 + 至少一次扩张"，**不静默改数值**。

### 7.2 回归

- `channel.spec.ts`、`duan-channel.spec.ts`、`chan-core.spec.ts`：既有断言补 `expanded:false`/版本 2；
  几何断言不变。
- `chan-core.mapper.spec.ts`：channel(~L110) 与 duanChannel(~L216) 字面量补 `expanded:false` +
  `expect(vo.expanded).toBe(false)`。
- **characterization re-baseline（专项评审）**：`chan-full-output.characterization.spec.ts` 的
  `algorithmVersion`(1→2) 在 fingerprint payload 内 → SHA 必变；**新增一个笔级扩张 fixture/case**
  （两个相邻波动重叠中枢 → 收敛为一个 expanded）固化字节 + SHA；更新 expected SHA 并解释；现有
  45-K fixture 的 counts（channel phaseA/phaseB=1）不变。**不得静默改**。

### 7.3 真实数据验证（scratch，不固化）

- 临时 spec `central-expansion.scratch.spec.ts`（落地后**删除**）：拉 600519 日 K（Tencent API
  `param=sh600519,day,,,N,qfq`）→ `createBi → createDuan → createChannels/createDuanChannels` →
  打印两级别 phaseB 每中枢 `{元素数, zg,zd,gg,dd, expanded}` → 人工核对扩张归并（对照价格走势与波动
  区间）。
- 报告区分：通过 / 跳过 / 环境阻塞（网络/API）。

## 8. 验证命令（受影响仓库基线，全绿才合）

```bash
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci       # jest 脚本需带 --forceExit（见记忆）
pnpm run ci:contracts
pnpm run build:docker
/Users/moyui/Library/pnpm/bin/openspec validate --all --strict
```

- 检索：`libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import（guard 已覆盖）；
  未恢复 Chan persistence；`/v1/chan/*` 路由无新增/无破坏。

## 9. 非目标 / 开放实现问题

- **不做**：买卖点、背驰判定、持久化、migration、新增 HTTP 端点、改 `mergeK/findFenxings/createBi/
  createDuan`、改 Phase A、恢复 Chan persistence。
- **已定（用户拍板 08-20）**：D1 相切也算扩张；D2/D3 几何合并 + 双 `expanded` 必需字段；D5 笔+段；
  D6 algorithmVersion=2 + fingerprint 同 change 更新；D9 只加交叉引用（divergence 侧改动留待其恢复
  落地）。
- **开放实现问题（落地时定，记回 design）**：
  1. `resolveCentralExpansions` 浅拷贝数组（`map({...channel})`）保证不改调用方持有的 phaseB ——与
     `mergeSpans` 浅克隆约定一致；确认展开序对确定性无副作用。
  2. 笔级扩张 case 的 characterization fixture 需要真实可复现的笔序列（构造两相邻波动重叠笔级中枢）
     ——落地时若数值取不到自然样例，用合成 bis 序列固化（与现有 45-K fixture 同法）。
  3. `unionByStartTime` 泛型 helper 放 `central-expansion.ts` 内部；不重复造到 `span-merge.ts`。

## 10. 落地顺序（第三步，待本计划确认后）

1. 建 worktree/分支；node_modules symlink（如需）。
2. `contracts.ts`（双接口 `expanded`）+ `central-expansion.ts`（5 函数）+ 两个 calculator 接线
   （各 3 处构造点补字段）+ `chan-core.ts` 版本 2。
3. app 层 VO/mapper/镜像类型同步。
4. 单测：`central-expansion.spec.ts`（§7.1）+ 回归（§7.2）+ characterization re-baseline。
5. 真实数据 scratch（600519，§7.3）→ 人工核对 → 删除 scratch。
6. 全量基线验证（§8）→ 报告（通过/跳过/环境阻塞）→ 等用户确认 → 合 master → push（origin-https）。
