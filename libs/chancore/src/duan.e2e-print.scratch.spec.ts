/**
 * 临时 E2E 打印 spec（非正式测试）：用真实 600519 日 K（121 根，qfq）跑 createBi+createDuan，
 * 打印笔/段划分供人工缠论校验。校验完删除本文件。
 */
import { readFileSync } from 'node:fs';
import { ChanCore } from './index';
import type { ChanK } from './index';

function buildK(): ChanK[] {
  const rows = JSON.parse(readFileSync('/tmp/600519-day.json', 'utf8')).data
    .sh600519.qfqday as [string, string, string, string, string, string][];
  return rows.map((r, i) => ({
    id: i + 1,
    symbol: '600519',
    time: new Date(`${r[0]}T00:00:00.000Z`),
    open: Number(r[1]),
    close: Number(r[2]),
    high: Number(r[3]),
    low: Number(r[4]),
    volume: r[5],
    amount: null,
  }));
}

function biIndex(bis: readonly { startTime: Date }[], bi: unknown): number {
  return bis.findIndex(
    (b) =>
      b.startTime.getTime() === (bi as { startTime: Date }).startTime.getTime(),
  );
}

describe('Duan E2E print (600519 daily, scratch)', () => {
  it('prints bi and duan division', () => {
    const k = buildK();
    const bis = ChanCore.createBi(k);
    const duans = ChanCore.createDuan(bis);

    console.log(
      'K bars:',
      k.length,
      '| bi phaseB:',
      bis.phaseB.length,
      '| duan:',
      duans.length,
    );
    console.log('\n=== 笔 phaseB ===');
    bis.phaseB.forEach((bi, i) => {
      console.log(
        `bi[${i}] ${bi.trend.padEnd(4)} ${bi.type}/${bi.status} H=${bi.high} L=${bi.low} ` +
          `${bi.startTime.toISOString().slice(0, 10)}..${bi.endTime.toISOString().slice(0, 10)}`,
      );
    });
    console.log('\n=== 段（确认后） ===');
    duans.forEach((d, i) => {
      const s = biIndex(bis.phaseB, d.startBi);
      const e = d.endBi === null ? -1 : biIndex(bis.phaseB, d.endBi);
      console.log(
        `duan[${i}] ${d.trend.padEnd(4)} ${d.type}/${d.status} H=${d.high} L=${d.low} bis=${d.originBis.length} ` +
          `(bi#${s}..bi#${e}) ${d.startTime.toISOString().slice(0, 10)}..${d.endTime.toISOString().slice(0, 10)}`,
      );
    });
  });
});
