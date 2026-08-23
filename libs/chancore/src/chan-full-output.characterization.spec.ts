import { createHash } from 'node:crypto';
import { BiStatus, BiType, ChanCore } from './index';
import type {
  ChanBi,
  ChanChannel,
  ChanDuan,
  ChanDuanChannel,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './index';
import {
  ChanCharacterizationK,
  createChanFullOutputFixture,
} from './chan-full-output.characterization.fixture';
import { DuanStatus, DuanType, TrendDirection } from './contracts';

const EXPECTED_FULL_OUTPUT_SHA256 =
  'a2b8cde26f8519e7e970cc96ee6451f8d5a061f9ff26367168ce60906ef08ad9';

function toContractK(source: ChanK): ChanCharacterizationK {
  return {
    id: source.id,
    symbol: source.symbol,
    time: new Date(source.time.getTime()),
    open: source.open,
    high: source.high,
    low: source.low,
    close: source.close,
    volume: source.volume,
    amount: source.amount,
  };
}

function toContractFenxing(fenxing: ChanFenxing | null) {
  if (!fenxing) return null;
  return {
    leftIds: [...fenxing.leftIds],
    middleIds: [...fenxing.middleIds],
    rightIds: [...fenxing.rightIds],
    middleIndex: fenxing.middleIndex,
    middleOriginId: fenxing.middleOriginId,
    type: fenxing.type,
    high: fenxing.high,
    low: fenxing.low,
  };
}

function toContractMergedK(mergedK: ChanMergedK) {
  return {
    startTime: new Date(mergedK.startTime.getTime()),
    endTime: new Date(mergedK.endTime.getTime()),
    high: mergedK.high,
    low: mergedK.low,
    trend: mergedK.trend,
    mergedCount: mergedK.mergedCount,
    mergedIds: [...mergedK.mergedIds],
    mergedData: mergedK.mergedData.map(toContractK),
  };
}

function toContractBi(bi: ChanBi) {
  return {
    startTime: new Date(bi.startTime.getTime()),
    endTime: new Date(bi.endTime.getTime()),
    high: bi.high,
    low: bi.low,
    trend: bi.trend,
    type: bi.type,
    status: bi.status,
    independentCount: bi.independentCount,
    originIds: [...bi.originIds],
    originData: bi.originData.map(toContractK),
    startFenxing: toContractFenxing(bi.startFenxing),
    endFenxing: toContractFenxing(bi.endFenxing),
  };
}

function toContractChannel(channel: ChanChannel) {
  return {
    bis: channel.bis.map(toContractBi),
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
    level: channel.level,
    type: channel.type,
    status: channel.status,
    trend: channel.trend,
    expanded: channel.expanded,
    startId: channel.startId,
    endId: channel.endId,
    displayStartId: channel.displayStartId,
    displayEndId: channel.displayEndId,
  };
}

function runCoreFullPipeline() {
  const input = createChanFullOutputFixture();
  const merged = ChanCore.mergeK(input);
  const fenxings = ChanCore.findFenxings(input);
  const bis = ChanCore.createBi(input);
  const channels = ChanCore.createChannels(input);

  return {
    input,
    merged,
    fenxings,
    bis,
    channels,
    fingerprintPayload: {
      // 2：add-chan-central-extension 起 createChannels/createDuanChannels 增加中枢扩张归并
      algorithmVersion: 2,
      input,
      output: {
        mergedK: merged.map(toContractMergedK),
        fenxings: fenxings.map((fenxing) => toContractFenxing(fenxing)),
        bis: {
          phaseA: bis.phaseA.map(toContractBi),
          phaseB: bis.phaseB.map(toContractBi),
        },
        channels: {
          phaseA: channels.phaseA.map(toContractChannel),
          phaseB: channels.phaseB.map(toContractChannel),
        },
      },
    },
  };
}

describe('ChanCore full-output differential characterization', () => {
  it('locks one raw K through merged K, Fenxing, Bi and Channel fingerprint', () => {
    const result = runCoreFullPipeline();
    const inputIds = result.input.map((k) => k.id);

    expect(result.input).toHaveLength(45);
    expect(new Set(inputIds).size).toBe(inputIds.length);
    expect(
      inputIds.some((id, index) => index > 0 && id < inputIds[index - 1]),
    ).toBe(true);
    expect(result.merged).toHaveLength(38);
    expect(result.fenxings).toHaveLength(15);
    expect(result.bis.phaseA).toHaveLength(9);
    expect(result.bis.phaseB).toHaveLength(9);
    expect(result.channels.phaseA).toHaveLength(1);
    expect(result.channels.phaseB).toHaveLength(1);

    const fingerprint = createHash('sha256')
      .update(JSON.stringify(result.fingerprintPayload))
      .digest('hex');
    expect(fingerprint).toBe(EXPECTED_FULL_OUTPUT_SHA256);
  });

  it('locks unique wide-Bi endpoints and position distance with sparse IDs', () => {
    const { bis } = runCoreFullPipeline();
    const validCompleteBis = bis.phaseB.filter(
      (bi) => bi.type === BiType.Complete && bi.status === BiStatus.Valid,
    );

    expect(validCompleteBis.length).toBeGreaterThan(0);
    for (const bi of validCompleteBis) {
      const ids = bi.originData.map((k) => k.id);
      const startPositions = ids.flatMap((id, index) =>
        id === bi.startFenxing?.middleOriginId ? [index] : [],
      );
      const endPositions = ids.flatMap((id, index) =>
        id === bi.endFenxing?.middleOriginId ? [index] : [],
      );

      expect(startPositions).toHaveLength(1);
      expect(endPositions).toHaveLength(1);
      expect(endPositions[0] - startPositions[0]).toBeGreaterThanOrEqual(4);
      expect(
        Math.abs(
          bi.endFenxing!.middleOriginId - bi.startFenxing!.middleOriginId,
        ),
      ).not.toBe(endPositions[0] - startPositions[0]);
    }
  });

  it('locks Duan-level central-extension resolution (adjacent wave overlap merges to one expanded Unit)', () => {
    // 段级扩张 fixture：两中枢（区间[7,9]与[2,4]不重叠、波动[4,11]与[1,8]重叠）→ Phase C 归并为一个 expanded
    const duans = createDuanExpansionFixture();
    const { phaseA, phaseB } = ChanCore.createDuanChannels(duans);

    expect(phaseA.length).toBeGreaterThan(0);
    expect(phaseB).toHaveLength(1);
    expect(phaseB[0].expanded).toBe(true);
    expect(phaseB[0].zg).toBe(8); // 波动重叠区上沿 = min(gg1,gg2)
    expect(phaseB[0].zd).toBe(1); // 波动重叠区下沿 = max(dd1,dd2)

    const payload = {
      algorithmVersion: 2,
      duans: duans.map(toContractDuan),
      output: {
        phaseA: phaseA.map(toContractDuanChannel),
        phaseB: phaseB.map(toContractDuanChannel),
      },
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    expect(fingerprint).toBe(EXPECTED_DUAN_EXPANSION_SHA256);
  });
});

/** Duan-level central-extension fingerprint（add-chan-central-extension 新增）。 */
const EXPECTED_DUAN_EXPANSION_SHA256 =
  '0083a44b1edf367638185645fef43a6f1ba800d0c1fe716c230748361258fe24';

function toContractDuan(duan: ChanDuan) {
  return {
    startTime: new Date(duan.startTime.getTime()),
    endTime: new Date(duan.endTime.getTime()),
    high: duan.high,
    low: duan.low,
    trend: duan.trend,
    type: duan.type,
    status: duan.status,
    originIds: [...duan.originIds],
  };
}

function toContractDuanChannel(channel: ChanDuanChannel) {
  return {
    duans: channel.duans.map(toContractDuan),
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
    level: channel.level,
    type: channel.type,
    status: channel.status,
    expanded: channel.expanded,
    startId: channel.startId,
    endId: channel.endId,
    displayStartId: channel.displayStartId,
    displayEndId: channel.displayEndId,
  };
}

/** 段级扩张 fixture（同 central-expansion.spec 的集成样例）。 */
function createDuanExpansionFixture(): ChanDuan[] {
  return [
    makeDuan(0, 'up', 11, 4),
    makeDuan(1, 'down', 9, 6),
    makeDuan(2, 'up', 10, 7),
    makeDuan(3, 'down', 8, 1),
    makeDuan(4, 'up', 6, 1),
    makeDuan(5, 'down', 4, 2),
  ];
}

function makeDuan(
  id: number,
  trend: 'up' | 'down',
  high: number,
  low: number,
): ChanDuan {
  // Date.UTC 构造 → TZ 无关（CI 以 TZ=UTC 跑 test:ci，避免 SHA 漂移）
  const time = new Date(Date.UTC(2026, 6, 1, 9, id * 10, 0, 0));
  return {
    startTime: time,
    endTime: new Date(time.getTime() + 60_000),
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: DuanType.Complete,
    status: DuanStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1, id * 100 + 2],
    originBis: [],
    startBi: null,
    endBi: null,
  };
}
