import {
  ChanCore,
  ChanBspType,
  type ChanBi,
  type ChanBspUnit,
  type ChanChannel,
  type ChanDivergenceZhongshu,
  type ChanDuan,
  type ChanDuanChannel,
  type ChanK,
} from '@app/chancore';
import { computeChanUnitForces } from '@app/indicators';
import type { ProjectedStrategyBar } from '@app/market-data';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export type ChanBspUnitLevel = 'bi' | 'duan';

export type ChanBspDirection = 'buy' | 'sell' | 'both';

export interface ChanBspPluginParams {
  readonly units?: ChanBspUnitLevel;
  readonly direction?: ChanBspDirection;
  readonly points?: {
    readonly first?: boolean;
    readonly second?: boolean;
    readonly third?: boolean;
  };
  readonly requiredBarCount?: number;
  readonly deduplicate?: boolean;
}

export interface ChanBspDetectedEvent {
  readonly type: ChanBspType;
  readonly units: ChanBspUnitLevel;
  readonly time: Date;
  readonly price: number;
  readonly zhongshuIndex: number | null;
  readonly zg: number | null;
  readonly zd: number | null;
  readonly unitIndex: number;
}

/**
 * 缠论买卖点因子插件
 * 封装 ChanCore 算法与增量游标，领域中立地输出 FactorOpinion
 */
export class ChanBspFactorPlugin implements FactorPlugin {
  public readonly id = 'plugin.chan.bsp';
  public readonly name = '缠论买卖点因子插件';
  public readonly category = 'CHAN' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '基于形态几何、特征序列与中枢背驰动力学计算缠论一/二/三类买卖点';

  public readonly paramSchema = {
    units: { type: 'string', enum: ['bi', 'duan'], default: 'bi' },
    direction: {
      type: 'string',
      enum: ['buy', 'sell', 'both'],
      default: 'buy',
    },
    points: {
      type: 'object',
      properties: {
        first: { type: 'boolean', default: true },
        second: { type: 'boolean', default: true },
        third: { type: 'boolean', default: true },
      },
    },
    requiredBarCount: { type: 'number', default: 50 },
    deduplicate: { type: 'boolean', default: false },
  };

  /** 增量发射游标：key -> lastEmittedUnitIndex */
  private readonly cursorMap = new Map<string, number>();

  public resetCursors(): void {
    this.cursorMap.clear();
  }

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const params = this.resolveParams(rawParams);
    const minBars =
      params.requiredBarCount ?? (params.units === 'duan' ? 200 : 50);

    if (context.bars.length < minBars) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: `K线不足${minBars}根(当前${context.bars.length}根)，无法确立缠论结构`,
      };
    }

    const klines = this.toChanKSeries(context.bars);
    if (klines.length === 0) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: '有效行情数据为空，未形成缠论K线',
      };
    }

    const units = params.units ?? 'bi';
    const allEvents = this.detectEvents(klines, units);
    const matchedEvents = allEvents.filter((event) =>
      this.matchesFilter(event, params),
    );

    if (matchedEvents.length === 0) {
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: '未检测到满足条件的缠论买卖点',
      };
    }

    // 处理去重游标
    let candidateEvents = matchedEvents;
    if (params.deduplicate) {
      const cursorKey = `${context.securityId}:${context.period}:${params.units}`;
      const lastEmitted = this.cursorMap.get(cursorKey) ?? -1;
      candidateEvents = matchedEvents.filter((e) => e.unitIndex > lastEmitted);
      if (candidateEvents.length === 0) {
        return {
          action: 'NEUTRAL',
          confidence: 0.0,
          reason: '缠论买卖点已在先前半闭合单元发射，无需重复触发',
        };
      }
      const maxUnit = Math.max(...candidateEvents.map((e) => e.unitIndex));
      this.cursorMap.set(cursorKey, Math.max(lastEmitted, maxUnit));
    }

    // 取最新一个买卖点作为主要触发决策
    const latestEvent = candidateEvents[candidateEvents.length - 1];
    const isBuy = latestEvent.type.endsWith('_buy');
    const action = isBuy ? 'BUY' : 'SELL';
    const confidence = this.computeConfidence(latestEvent.type);
    const unitLabel = params.units === 'duan' ? '线段' : '笔';
    const pointLabel = this.formatPointName(latestEvent.type);

    return {
      action,
      confidence,
      reason: `缠论${unitLabel}级${pointLabel}确认 (价格: ${latestEvent.price.toFixed(2)})`,
      evidence: {
        eventType: latestEvent.type,
        units: latestEvent.units,
        price: latestEvent.price,
        time: latestEvent.time.toISOString(),
        zg: latestEvent.zg,
        zd: latestEvent.zd,
        zhongshuIndex: latestEvent.zhongshuIndex,
        unitIndex: latestEvent.unitIndex,
        allCandidatesCount: candidateEvents.length,
      },
    };
  }

  private resolveParams(params?: Record<string, unknown>): ChanBspPluginParams {
    return {
      units: (params?.units as ChanBspUnitLevel) ?? 'bi',
      direction: (params?.direction as ChanBspDirection) ?? 'buy',
      points: {
        first: params?.points ? (params.points as any).first !== false : true,
        second: params?.points ? (params.points as any).second !== false : true,
        third: params?.points ? (params.points as any).third !== false : true,
      },
      requiredBarCount:
        typeof params?.requiredBarCount === 'number'
          ? params.requiredBarCount
          : undefined,
      deduplicate: params?.deduplicate === true,
    };
  }

  private toChanKSeries(
    bars: readonly ProjectedStrategyBar[],
  ): readonly ChanK[] {
    const series: ChanK[] = [];
    for (let i = 0; i < bars.length; i += 1) {
      const b = bars[i];
      const ohlc = b.ohlc.effective;
      if (!ohlc) continue;
      series.push({
        id: i + 1,
        symbol: String(b.rawBar.securityId),
        time: b.rawBar.timestamp,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: b.volume.effective,
        amount: b.amount.effective,
      });
    }
    return series;
  }

  private detectEvents(
    klines: readonly ChanK[],
    units: ChanBspUnitLevel,
  ): readonly ChanBspDetectedEvent[] {
    const bis = ChanCore.createBi(klines);
    const phaseB = bis.phaseB;

    let bspUnits: readonly ChanBspUnit[];
    let zhongshus: readonly ChanDivergenceZhongshu[];

    if (units === 'duan') {
      const duans = ChanCore.createDuan(phaseB);
      const duanChannels = ChanCore.createDuanChannels(duans);
      bspUnits = duans.map(toBspUnit);
      zhongshus = duanChannels.phaseB.map(toZhongshu);
    } else {
      const channels = ChanCore.createChannels(klines);
      bspUnits = phaseB.map(toBspUnit);
      zhongshus = channels.phaseB.map(toZhongshu);
    }

    const forces = computeChanUnitForces(klines, bspUnits);
    const rawPoints = ChanCore.detectBuySellPoints({
      units: bspUnits,
      zhongshus,
      forces,
    });

    return rawPoints.map((p) => {
      const unit = bspUnits[p.unitIndex];
      const zs =
        p.zhongshuIndex !== null ? (zhongshus[p.zhongshuIndex] ?? null) : null;
      return {
        type: p.type,
        units,
        time: unit.endTime,
        price: p.price,
        zhongshuIndex: p.zhongshuIndex,
        zg: zs ? zs.zg : null,
        zd: zs ? zs.zd : null,
        unitIndex: p.unitIndex,
      };
    });
  }

  private matchesFilter(
    event: ChanBspDetectedEvent,
    params: ChanBspPluginParams,
  ): boolean {
    const isBuy = event.type.endsWith('_buy');
    if (params.direction === 'buy' && !isBuy) return false;
    if (params.direction === 'sell' && isBuy) return false;

    const points = params.points ?? {};
    if (event.type.startsWith('first_') && points.first === false) return false;
    if (event.type.startsWith('second_') && points.second === false)
      return false;
    if (event.type.startsWith('third_') && points.third === false) return false;

    return true;
  }

  private computeConfidence(type: ChanBspType): number {
    switch (type) {
      case 'first_buy':
      case 'first_sell':
        return 0.92;
      case 'third_buy':
      case 'third_sell':
        return 0.9;
      case 'second_buy':
      case 'second_sell':
        return 0.86;
      default:
        return 0.8;
    }
  }

  private formatPointName(type: ChanBspType): string {
    switch (type) {
      case 'first_buy':
        return '一买';
      case 'first_sell':
        return '一卖';
      case 'second_buy':
        return '二买';
      case 'second_sell':
        return '二卖';
      case 'third_buy':
        return '三买';
      case 'third_sell':
        return '三卖';
      default:
        return type;
    }
  }
}

function toBspUnit(
  unit: Pick<
    ChanBi | ChanDuan,
    'startTime' | 'endTime' | 'high' | 'low' | 'trend'
  >,
): ChanBspUnit {
  return {
    startTime: unit.startTime,
    endTime: unit.endTime,
    high: unit.high,
    low: unit.low,
    trend: unit.trend,
  };
}

function toZhongshu(
  channel: ChanChannel | ChanDuanChannel,
): ChanDivergenceZhongshu {
  const units = 'bis' in channel ? channel.bis : channel.duans;
  const first = units[0];
  const last = units.at(-1);
  if (!first || !last) {
    throw new RangeError('chan channel must contain at least one unit');
  }
  return {
    firstUnitTime: first.startTime,
    lastUnitTime: last.endTime,
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
  };
}
