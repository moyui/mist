import { ChannelLevel, ChannelStatus, ChannelType } from '../contracts';
import type { ChanChannel, ChanDuanChannel } from '../contracts';

/**
 * ChanCore internal helper — 中枢扩张（Central Extension，缠论 29 课 级别扩展）识别与归并。
 *
 * 两个相邻同级别中枢（笔级或段级）的**波动区间（gg/dd）重叠/相切**即中枢扩张，不再构成同级别
 * 趋势链（趋势 = ≥2 个依次同向、波动区间不重叠的同级别中枢）。本模块把扩张对归并为一个更高级别
 * 中枢（`expanded: true`），让 Phase B 输出相邻严格分离，供背驰趋势链消费。
 *
 * 与 {@link mergeSpans} 的关系：`mergeSpans` 是"任意 span + envelope"多段合并驱动（Bi/Channel 共用），
 * 扩张只属于**相邻对**，语义不匹配，故不复用；本模块沿用其"共享驱动 + 注入领域操作"哲学——
 * {@link resolveCentralExpansions} 接收按级注入的 {@link mergeTwo}。
 */
export interface CentralRangeItem {
  readonly dd: number; // 波动区间最低
  readonly gg: number; // 波动区间最高
}

/**
 * 扩张判定（D1 定案：相切也算扩张，"触及即扩张" 29 课字面）：
 * 两相邻同级中枢波动区间重叠或相切。经最小接口 {@link CentralRangeItem}，笔级/段级通吃、无方向认知。
 */
export function isCentralExpansion(
  prev: CentralRangeItem,
  next: CentralRangeItem,
): boolean {
  return Math.max(prev.dd, next.dd) <= Math.min(prev.gg, next.gg);
}

/**
 * 相邻对固定点归并（Phase C 驱动）：从左到右扫描，命中扩张对即并一个并重扫；
 * 返回相邻对**严格分离**序列（任意相邻对 `max(dd) > min(gg)`）。
 * 最左优先 → 确定性；每次合并缩短数组 → 必然收敛；浅克隆输入，不改调用方数组/元素
 * （与 {@link mergeSpans} 的浅克隆约定一致）。
 */
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
        result.splice(i + 1, 1); // 两个并一个，序列缩短
        merged = true;
        break;
      }
    }

    if (!merged) {
      return result;
    }
  }
}

/**
 * 笔级扩张合并：union bis（startTime 去重）+ 波动重叠区（zd/zg）+ 并集极值（dd/gg）+ `expanded: true`。
 *
 * 关键：union 用笔级方向性公式（首末突破约束）重算在典型扩张下必然无效（design §2.2），故合并中枢
 * 采用**波动重叠区** `zd = max(prev.dd, next.dd)`、`zg = min(prev.gg, next.gg)`——这是更高级别中枢体
 * （29 课 A~ 几何）；其几何**豁免**笔级不变式，靠 `expanded` 与普通同级中枢区分。相切扩张时
 * `zg === zd`（退化扩展单元，不要求 `zg > zd`）。`trend` 继承首中枢（离开方向）。
 */
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
    status: ChannelStatus.Valid, // 已被判定扩张并归并
    trend: prev.trend,
    expanded: true,
    startId: prev.startId,
    endId: next.endId,
    displayStartId: prev.displayStartId,
    displayEndId: next.displayEndId,
  };
}

/**
 * 段级扩张合并：union duans（startTime 去重）+ 波动重叠区（zd/zg）+ 并集极值（dd/gg）+
 * `expanded: true`（段级中枢无 trend）。几何同样豁免段级对称重叠不变式（design §2.2）。
 */
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
function unionByStartTime<T extends { readonly startTime: Date }>(
  ...groups: readonly (readonly T[])[]
): T[] {
  const seen = new Set<number>();
  const result: T[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = item.startTime.getTime();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
