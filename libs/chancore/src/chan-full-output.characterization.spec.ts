import { createHash } from 'node:crypto';
import { BiStatus, BiType, ChanCore } from './index';
import type {
  ChanBi,
  ChanChannel,
  ChanFenxing,
  ChanK,
  ChanMergedK,
} from './index';
import {
  ChanCharacterizationK,
  createChanFullOutputFixture,
} from './chan-full-output.characterization.fixture';

const EXPECTED_FULL_OUTPUT_SHA256 =
  '7a24563a1d419c87cc151cfcd83ce42732fe59b6fc535de2d818699994964312';

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
      algorithmVersion: 1,
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
});
