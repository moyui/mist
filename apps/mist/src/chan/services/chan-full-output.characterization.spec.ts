import { createHash } from 'node:crypto';
import { BiStatus, BiType } from '../enums/bi.enum';
import type { FenxingVo } from '../vo/fenxing.vo';
import type { BiVo } from '../vo/bi.vo';
import type { ChannelVo } from '../vo/channel.vo';
import type { MergedKVo } from '../vo/merged-k.vo';
import type { KVo } from '../../indicator/vo/k.vo';
import { BiService } from './bi.service';
import { ChannelService } from './channel.service';
import {
  ChanCharacterizationK,
  createChanFullOutputFixture,
} from './chan-full-output.characterization.fixture';
import { KMergeService } from './k-merge.service';
import { TrendService } from './trend.service';

type LegacyK = KVo & { volume: string | null };

const EXPECTED_FULL_OUTPUT_SHA256 =
  '7a24563a1d419c87cc151cfcd83ce42732fe59b6fc535de2d818699994964312';

function toLegacyK(k: ChanCharacterizationK): LegacyK {
  return {
    id: k.id,
    symbol: k.symbol,
    time: new Date(k.time.getTime()),
    open: k.open,
    highest: k.high,
    lowest: k.low,
    close: k.close,
    volume: k.volume,
    amount: k.amount,
  };
}

function toContractK(k: KVo): ChanCharacterizationK {
  const source = k as LegacyK;
  return {
    id: source.id,
    symbol: source.symbol,
    time: new Date(source.time.getTime()),
    open: source.open,
    high: source.highest,
    low: source.lowest,
    close: source.close,
    volume: source.volume,
    amount: source.amount,
  };
}

function toContractFenxing(fenxing: FenxingVo | null) {
  if (!fenxing) return null;
  return {
    leftIds: [...fenxing.leftIds],
    middleIds: [...fenxing.middleIds],
    rightIds: [...fenxing.rightIds],
    middleIndex: fenxing.middleIndex,
    middleOriginId: fenxing.middleOriginId,
    type: fenxing.type,
    high: fenxing.highest,
    low: fenxing.lowest,
  };
}

function toContractMergedK(mergedK: MergedKVo) {
  return {
    startTime: new Date(mergedK.startTime.getTime()),
    endTime: new Date(mergedK.endTime.getTime()),
    high: mergedK.highest,
    low: mergedK.lowest,
    trend: mergedK.trend,
    mergedCount: mergedK.mergedCount,
    mergedIds: [...mergedK.mergedIds],
    mergedData: mergedK.mergedData.map(toContractK),
  };
}

function toContractBi(bi: BiVo) {
  return {
    startTime: new Date(bi.startTime.getTime()),
    endTime: new Date(bi.endTime.getTime()),
    high: bi.highest,
    low: bi.lowest,
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

function toContractChannel(channel: ChannelVo) {
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

function runLegacyFullPipeline() {
  const input = createChanFullOutputFixture();
  const merged = new KMergeService(new TrendService()).merge(
    input.map(toLegacyK),
  );
  const biService = new BiService();
  const fenxings = biService.getFenxings(merged);
  const bis = biService.getBi(merged);
  const channels = new ChannelService().createChannel({ bi: bis.phaseB });

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

describe('legacy Chan full-output characterization', () => {
  it('locks one raw K through merged K, Fenxing, Bi and Channel fingerprint', () => {
    const result = runLegacyFullPipeline();
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
    const { bis } = runLegacyFullPipeline();
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
