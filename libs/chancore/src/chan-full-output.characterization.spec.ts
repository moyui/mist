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
import { createChanDuanAnchorFixture } from './chan-duan-anchor.characterization.fixture';
import { DuanStatus, DuanType, TrendDirection } from './contracts';

const EXPECTED_FULL_OUTPUT_SHA256 =
  '352c7c5b5c3fddfb7eb60913e17ebea8f5cee0a652ea061efda54665ce69b811';

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
      // 5：add-duan-first-bi-break-rule 起（历次算法版本 bump 同步）；主管道仅锁定
      // mergedK/fenxings/bis/channels，duan 输出由 chan-duan-anchor fingerprint 单独锁定
      algorithmVersion: 6,
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
    // 600519 日线 fixture 的 9 笔中 7 根宽笔不达标（status=invalid）——
    // 6 版起笔中枢只消费确认且有效笔，原先由无效笔构成的 1 个中枢消失（18 课语义修正）
    expect(result.channels.phaseA).toHaveLength(0);
    expect(result.channels.phaseB).toHaveLength(0);

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

  it('locks Duan-level sequential resolution (adjacent wave overlap retains separate sequential units in phaseB)', () => {
    const duans = createDuanExpansionFixture();
    const { phaseA, phaseB } = ChanCore.createDuanChannels(duans);

    expect(phaseA.length).toBeGreaterThan(0);
    expect(phaseB).toHaveLength(2);
    expect(phaseB[0].zd).toBe(7);
    expect(phaseB[0].zg).toBe(9);
    expect(phaseB[1].zd).toBe(2);
    expect(phaseB[1].zg).toBe(4);

    const payload = {
      algorithmVersion: 7,
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

  it('locks the lesson-71 first-Bi-break Duan outcomes on the 5m 000001 anchor window', () => {
    // 真实 5m/qmt/000001 窗口（2026-06-17 ~ 2026-06-30 上海）：覆盖锚点 A 全链
    // （06-18 10:05 顶 4117.45 → Dn → 单笔 Up 段至 06-23 10:40 顶 4175.35 → 新 Dn 段）。
    // 锁定的正是 71 课第一笔破坏判据引入后的段输出形态。
    const k = createChanDuanAnchorFixture();
    const { phaseB: bis } = ChanCore.createBi(k);
    const duans = ChanCore.createDuan(bis);

    // 语义断言：
    // 1) 存在合规的 Complete Up 段 (originBis >= 3)，其峰值 = 4175.35 顶
    const topIdx = duans.findIndex(
      (d) =>
        d.type === DuanType.Complete &&
        d.trend === TrendDirection.Up &&
        d.originBis.length >= 3 &&
        d.high === 4175.35,
    );
    expect(topIdx).toBeGreaterThanOrEqual(0);
    // 2) 确保所有 Complete 线段 originBis >= 3
    for (const d of duans) {
      if (d.type === DuanType.Complete) {
        expect(d.originBis.length).toBeGreaterThanOrEqual(3);
      }
    }

    const payload = {
      algorithmVersion: 8,
      bis: bis.map(toContractBi),
      duans: duans.map(toContractDuan),
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    expect(fingerprint).toBe(EXPECTED_DUAN_71_SHA256);
  });
});

/** Duan-level central-extension fingerprint（add-chan-central-extension 新增）。 */
const EXPECTED_DUAN_EXPANSION_SHA256 =
  'e8436bbd4754b0f69b44f1ffbaea1a20ab10ec64725ffa5dafb721b3ad80ec6b';

/** Duan lesson-65 minimum 3-bi axiom fingerprint（restore-chan-duan-three-bi-axiom 更新）。 */
const EXPECTED_DUAN_71_SHA256 =
  'b952eca1efefc5ac4a8ee2f0e5f344268ef9a2c423c01d8cab03268089511bc6';

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
