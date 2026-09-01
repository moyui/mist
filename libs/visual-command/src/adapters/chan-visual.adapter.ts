import {
  BiStatus,
  ChanCore,
  DuanStatus,
  ChanBspType,
  TrendDirection,
  type ChanBspUnit,
  type ChanDivergenceZhongshu,
  type ChanK,
} from '@app/chancore';
import { computeChanUnitForces } from '@app/indicators';
import { toZhongshu } from '@app/signal';
import type {
  BandVisualCommand,
  LineVisualCommand,
  TextVisualCommand,
  VisualCommand,
} from '../visual-command.types';

export interface ChanVisualOptions {
  readonly includeBi?: boolean;
  readonly includeDuan?: boolean;
  readonly includeZhongshu?: boolean;
  readonly includeBsp?: boolean;
  readonly biColor?: string;
  readonly duanColor?: string;
  readonly zhongshuBiColor?: string;
  readonly zhongshuDuanColor?: string;
}

export class ChanVisualAdapter {
  /**
   * Convert an array of standard K-lines into standard drawing commands.
   */
  static convert(
    klines: readonly ChanK[],
    options: ChanVisualOptions = {},
  ): readonly VisualCommand[] {
    if (!klines || klines.length < 3) {
      return [];
    }

    const {
      includeBi = true,
      includeDuan = true,
      includeZhongshu = true,
      includeBsp = true,
      biColor = '#FACC15', // Yellow
      duanColor = '#E879F9', // Purple/Fuchsia
      zhongshuBiColor = '#38BDF8', // Sky Blue
      zhongshuDuanColor = '#818CF8', // Indigo
    } = options;

    const commands: VisualCommand[] = [];

    // Map timestamp / id to K-line index for O(1) index lookup
    const timeToIndex = new Map<number, number>();
    const idToIndex = new Map<number, number>();
    klines.forEach((k, idx) => {
      timeToIndex.set(new Date(k.time).getTime(), idx);
      idToIndex.set(k.id, idx);
    });

    const getKIndex = (time: Date, id?: number): number | null => {
      const byTime = timeToIndex.get(new Date(time).getTime());
      if (byTime !== undefined) return byTime;
      if (id !== undefined) {
        const byId = idToIndex.get(id);
        if (byId !== undefined) return byId;
      }
      return null;
    };

    // 1. Compute Bis (Strokes)
    const biTwoPhase = ChanCore.createBi(klines);
    const bis = biTwoPhase.phaseB;

    if (includeBi && bis.length > 0) {
      bis.forEach((bi, i) => {
        // 仅确认且有效的笔渲染（Invalid 宽笔失败候选与 Unknown 未完成尾笔不画）
        if (bi.status !== BiStatus.Valid) return;
        const startIdx = getKIndex(bi.startTime, bi.originIds[0]);
        const endIdx = getKIndex(
          bi.endTime,
          bi.originIds[bi.originIds.length - 1],
        );
        if (startIdx === null || endIdx === null) return;
        const isUp = bi.trend === TrendDirection.Up;
        const startPrice = isUp ? bi.low : bi.high;
        const endPrice = isUp ? bi.high : bi.low;

        const lineCmd: LineVisualCommand = {
          id: `chan_bi_${i}_${startIdx}_${endIdx}`,
          type: 'line',
          layer: 'chan_bi',
          startIndex: startIdx,
          endIndex: endIdx,
          startTime: new Date(bi.startTime).toISOString(),
          endTime: new Date(bi.endTime).toISOString(),
          startPrice,
          endPrice,
          color: biColor,
          width: 1,
          style: 'solid',
        };
        commands.push(lineCmd);
      });
    }

    // 2. Compute Bi Channels (Zhongshu)
    if (includeZhongshu) {
      const biChannels = ChanCore.createChannels(klines);
      biChannels.phaseB.forEach((zs, i) => {
        // 防御：中枢构成单元须全部确认且有效（chancore 已保证；防旧版本/外部数据）
        if (zs.bis.some((b) => b.status !== BiStatus.Valid)) return;
        const first = zs.bis[0];
        const last = zs.bis[zs.bis.length - 1];
        if (!first || !last) return;

        const fromIdx = getKIndex(first.startTime, zs.startId);
        const toIdx = getKIndex(last.endTime, zs.endId);
        if (fromIdx === null || toIdx === null) return;

        const bandCmd: BandVisualCommand = {
          id: `chan_zs_bi_${i}_${fromIdx}_${toIdx}`,
          type: 'band',
          layer: 'chan_zs_bi',
          fromIndex: fromIdx,
          toIndex: toIdx,
          fromTime: new Date(first.startTime).toISOString(),
          toTime: new Date(last.endTime).toISOString(),
          top: zs.zg,
          bottom: zs.zd,
          gg: zs.gg,
          dd: zs.dd,
          color: zhongshuBiColor,
          fill: true,
        };
        commands.push(bandCmd);
      });
    }

    // 3. Compute Duans (Segments)
    const duans = ChanCore.createDuan(bis);

    if (includeDuan && duans.length > 0) {
      duans.forEach((duan, i) => {
        // 仅确认且有效的段渲染（未完成尾段 endBi===null 不画；status 统一判据）
        if (duan.status !== DuanStatus.Valid || !duan.endBi) return;
        const startIdx = getKIndex(duan.startTime, duan.originIds[0]);
        const endIdx = getKIndex(
          duan.endTime,
          duan.originIds[duan.originIds.length - 1],
        );
        if (startIdx === null || endIdx === null) return;
        const isUp = duan.trend === TrendDirection.Up;
        const startBi = duan.startBi;
        const endBi = duan.endBi;

        const startPrice = startBi
          ? startBi.trend === TrendDirection.Up
            ? startBi.low
            : startBi.high
          : isUp
            ? duan.low
            : duan.high;

        const endPrice = endBi
          ? endBi.trend === TrendDirection.Up
            ? endBi.high
            : endBi.low
          : isUp
            ? duan.high
            : duan.low;

        const duanCmd: LineVisualCommand = {
          id: `chan_duan_${i}_${startIdx}_${endIdx}`,
          type: 'line',
          layer: 'chan_duan',
          startIndex: startIdx,
          endIndex: endIdx,
          startTime: new Date(duan.startTime).toISOString(),
          endTime: new Date(duan.endTime).toISOString(),
          startPrice,
          endPrice,
          color: duanColor,
          width: 2,
          style: 'solid',
        };
        commands.push(duanCmd);
      });
    }

    // 4. Compute Duan Channels (Zhongshu)
    if (includeZhongshu && duans.length > 0) {
      const duanChannels = ChanCore.createDuanChannels(duans);
      duanChannels.phaseB.forEach((zs, i) => {
        // 防御：中枢构成单元须全部确认且有效（chancore 已保证；防旧版本/外部数据）
        if (zs.duans.some((d) => d.status !== DuanStatus.Valid)) return;
        const first = zs.duans[0];
        const last = zs.duans[zs.duans.length - 1];
        if (!first || !last) return;

        const fromIdx = getKIndex(first.startTime, zs.startId);
        const toIdx = getKIndex(last.endTime, zs.endId);
        if (fromIdx === null || toIdx === null) return;

        const bandCmd: BandVisualCommand = {
          id: `chan_zs_duan_${i}_${fromIdx}_${toIdx}`,
          type: 'band',
          layer: 'chan_zs_duan',
          fromIndex: fromIdx,
          toIndex: toIdx,
          fromTime: new Date(first.startTime).toISOString(),
          toTime: new Date(last.endTime).toISOString(),
          top: zs.zg,
          bottom: zs.zd,
          gg: zs.gg,
          dd: zs.dd,
          color: zhongshuDuanColor,
          fill: true,
        };
        commands.push(bandCmd);
      });
    }

    // 5. Compute Buy/Sell Points (BSP)
    if (includeBsp && bis.length >= 3) {
      const biChannels = ChanCore.createChannels(klines);
      const bspUnits: readonly ChanBspUnit[] = bis.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        high: b.high,
        low: b.low,
        trend: b.trend,
      }));
      const zhongshus: readonly ChanDivergenceZhongshu[] =
        biChannels.phaseB.map(toZhongshu);

      const forces = computeChanUnitForces(klines, bspUnits);
      const points = ChanCore.detectBuySellPoints({
        units: bspUnits,
        zhongshus,
        forces,
      });

      points.forEach((pt, i) => {
        const unit = bspUnits[pt.unitIndex];
        if (!unit) return;
        const idx = getKIndex(unit.endTime);
        if (idx === null) return;
        const label = formatBspLabel(pt.type);
        const isSell = isSellBsp(pt.type);

        const textCmd: TextVisualCommand = {
          id: `chan_bsp_${i}_${pt.type}_${idx}`,
          type: 'text',
          layer: 'chan_bsp',
          index: idx,
          time: new Date(unit.endTime).toISOString(),
          price: pt.price,
          text: label,
          color: isSell ? '#22C55E' : '#EF4444', // Green for sell, Red for buy
          position: isSell ? 'above' : 'below',
        };
        commands.push(textCmd);
      });
    }

    return Object.freeze(commands);
  }
}

function formatBspLabel(type: ChanBspType): string {
  switch (type) {
    case ChanBspType.FirstBuy:
      return '1买';
    case ChanBspType.FirstSell:
      return '1卖';
    case ChanBspType.SecondBuy:
      return '2买';
    case ChanBspType.SecondSell:
      return '2卖';
    case ChanBspType.ThirdBuy:
      return '3买';
    case ChanBspType.ThirdSell:
      return '3卖';
    default:
      return String(type);
  }
}

function isSellBsp(type: ChanBspType): boolean {
  return (
    type === ChanBspType.FirstSell ||
    type === ChanBspType.SecondSell ||
    type === ChanBspType.ThirdSell
  );
}
