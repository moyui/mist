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
import type { ChanBspEvent, ChanBspEventType } from './chan-bsp.types';
import type { ChanBspUnitLevel } from '../chan-bsp-plan';

export interface ChanBspPipelineInput {
  readonly klines: readonly ChanK[];
  readonly units: ChanBspUnitLevel;
}

/**
 * Run the full Chan buy/sell point pipeline over one ordered K series:
 * merge → fenxing → bi → (duan + duan channels | bi channels) → momentum
 * forces (MACD directional histogram area + DIF extremes) →
 * ChanCore.detectBuySellPoints → ChanBspEvent mapping.
 *
 * Stateless and deterministic: the same input always yields the same output.
 * An empty or structurally insufficient series yields `[]` (not an error).
 */
export function runChanBspPipeline(
  input: ChanBspPipelineInput,
): readonly ChanBspEvent[] {
  if (input.klines.length === 0) return Object.freeze([]);
  const bis = ChanCore.createBi(input.klines);
  const phaseB = bis.phaseB;

  let units: readonly ChanBspUnit[];
  let zhongshus: readonly ChanDivergenceZhongshu[];
  if (input.units === 'duan') {
    const duans = ChanCore.createDuan(phaseB);
    const duanChannels = ChanCore.createDuanChannels(duans);
    units = duans.map(toBspUnit);
    zhongshus = duanChannels.phaseB.map(toZhongshu);
  } else {
    const channels = ChanCore.createChannels(input.klines);
    units = phaseB.map(toBspUnit);
    zhongshus = channels.phaseB.map(toZhongshu);
  }

  const forces = computeChanUnitForces(input.klines, units);
  const points = ChanCore.detectBuySellPoints({ units, zhongshus, forces });
  return Object.freeze(
    points.map((point) =>
      toEvent(point.type, point.unitIndex, point.price, {
        units: input.units,
        pointZhongshuIndex: point.zhongshuIndex,
        zhongshus,
        unitsByIndex: units,
      }),
    ),
  );
}

function toEvent(
  type: ChanBspType,
  unitIndex: number,
  price: number,
  context: {
    units: ChanBspUnitLevel;
    pointZhongshuIndex: number | null;
    zhongshus: readonly ChanDivergenceZhongshu[];
    unitsByIndex: readonly ChanBspUnit[];
  },
): ChanBspEvent {
  const unit = context.unitsByIndex[unitIndex];
  const zhongshu =
    context.pointZhongshuIndex === null
      ? null
      : (context.zhongshus[context.pointZhongshuIndex] ?? null);
  return Object.freeze({
    type: type as ChanBspEventType,
    units: context.units,
    time: unit.endTime,
    price,
    zhongshuIndex: context.pointZhongshuIndex,
    zg: zhongshu?.zg ?? null,
    zd: zhongshu?.zd ?? null,
    unitIndex,
  });
}

function toBspUnit(
  unit: Pick<
    ChanBi | ChanDuan,
    'startTime' | 'endTime' | 'high' | 'low' | 'trend'
  >,
): ChanBspUnit {
  return Object.freeze({
    startTime: unit.startTime,
    endTime: unit.endTime,
    high: unit.high,
    low: unit.low,
    trend: unit.trend,
  });
}

export function toZhongshu(
  channel: ChanChannel | ChanDuanChannel,
): ChanDivergenceZhongshu {
  const units = 'bis' in channel ? channel.bis : channel.duans;
  const first = units[0];
  const last = units.at(-1);
  if (!first || !last) {
    throw new RangeError('chan channel must contain at least one unit');
  }
  return Object.freeze({
    firstUnitTime: first.startTime,
    lastUnitTime: last.endTime,
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
  });
}
