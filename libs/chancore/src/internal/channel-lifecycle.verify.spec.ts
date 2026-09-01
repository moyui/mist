import { ChanCore } from '../chan-core';
import { createChanDuanAnchorFixture } from '../chan-duan-anchor.characterization.fixture';
import { createChanFullOutputFixture } from '../chan-full-output.characterization.fixture';

describe('ChannelLifecycle Verification', () => {
  it('runs Bi channels and Duan channels separately on 5m real anchor fixture', () => {
    const k = createChanDuanAnchorFixture();

    // 1. 笔与笔中枢
    const biResult = ChanCore.createBi(k);
    const biChannels = ChanCore.createChannels(k);

    console.log(
      '\n=================== [数据集 1: QMT 5m 真实行情 (000001)] ===================',
    );
    console.log('\n--- 1. 笔与笔中枢 (Bi-Level) ---');
    console.log(`有效笔总数 (Valid Bis): ${biResult.phaseB.length}`);
    console.log(`Phase A 基础笔中枢数: ${biChannels.phaseA.length}`);
    console.log(`Phase B 最终笔中枢数: ${biChannels.phaseB.length}`);
    biChannels.phaseB.forEach((c, i) => {
      console.log(
        `  [笔中枢 #${i + 1}] 包含笔数: ${c.bis.length}, expanded: ${c.expanded}, ` +
          `区间 [ZD, ZG]: [${c.zd.toFixed(2)}, ${c.zg.toFixed(2)}], 极值 [DD, GG]: [${c.dd.toFixed(2)}, ${c.gg.toFixed(2)}], ` +
          `起止: ${c.bis[0].startTime.toISOString().slice(0, 16).replace('T', ' ')} ~ ${c.bis[c.bis.length - 1].endTime.toISOString().slice(0, 16).replace('T', ' ')}`,
      );
    });

    // 2. 段与段中枢
    const duans = ChanCore.createDuan(biResult.phaseB);
    const duanChannels = ChanCore.createDuanChannels(duans);

    console.log('\n--- 2. 段与段中枢 (Duan-Level) ---');
    console.log(`有效段总数 (Valid Duans): ${duans.length}`);
    duans.forEach((d, i) => {
      console.log(
        `  [段 #${i + 1}] 方向: ${d.trend}, status: ${d.status}, low: ${d.low.toFixed(2)}, high: ${d.high.toFixed(2)}, ` +
          `起止: ${d.startTime.toISOString().slice(0, 16).replace('T', ' ')} ~ ${d.endTime.toISOString().slice(0, 16).replace('T', ' ')}`,
      );
    });
    console.log(`Phase A 基础段中枢数: ${duanChannels.phaseA.length}`);
    console.log(`Phase B 最终段中枢数: ${duanChannels.phaseB.length}`);
    duanChannels.phaseB.forEach((c, i) => {
      console.log(
        `  [段中枢 #${i + 1}] 包含段数: ${c.duans.length}, expanded: ${c.expanded}, ` +
          `区间 [ZD, ZG]: [${c.zd.toFixed(2)}, ${c.zg.toFixed(2)}], 极值 [DD, GG]: [${c.dd.toFixed(2)}, ${c.gg.toFixed(2)}], ` +
          `起止: ${c.duans[0].startTime.toISOString().slice(0, 16).replace('T', ' ')} ~ ${c.duans[c.duans.length - 1].endTime.toISOString().slice(0, 16).replace('T', ' ')}`,
      );
    });
  });

  it('runs Bi channels and Duan channels separately on 600519 daily fixture', () => {
    const k = createChanFullOutputFixture();

    const biResult = ChanCore.createBi(k);
    const biChannels = ChanCore.createChannels(k);

    console.log(
      '\n=================== [数据集 2: 贵州茅台 (600519) 日线行情] ===================',
    );
    console.log('\n--- 1. 笔与笔中枢 (Bi-Level) ---');
    console.log(`有效笔总数 (Valid Bis): ${biResult.phaseB.length}`);
    console.log(`Phase A 基础笔中枢数: ${biChannels.phaseA.length}`);
    console.log(`Phase B 最终笔中枢数: ${biChannels.phaseB.length}`);
    biChannels.phaseB.forEach((c, i) => {
      console.log(
        `  [笔中枢 #${i + 1}] 包含笔数: ${c.bis.length}, expanded: ${c.expanded}, ` +
          `区间 [ZD, ZG]: [${c.zd.toFixed(2)}, ${c.zg.toFixed(2)}], 极值 [DD, GG]: [${c.dd.toFixed(2)}, ${c.gg.toFixed(2)}], ` +
          `起止: ${c.bis[0].startTime.toISOString().slice(0, 10)} ~ ${c.bis[c.bis.length - 1].endTime.toISOString().slice(0, 10)}`,
      );
    });

    const duans = ChanCore.createDuan(biResult.phaseB);
    const duanChannels = ChanCore.createDuanChannels(duans);

    console.log('\n--- 2. 段与段中枢 (Duan-Level) ---');
    console.log(`有效段总数 (Valid Duans): ${duans.length}`);
    duans.forEach((d, i) => {
      console.log(
        `  [段 #${i + 1}] 方向: ${d.trend}, status: ${d.status}, low: ${d.low.toFixed(2)}, high: ${d.high.toFixed(2)}, ` +
          `起止: ${d.startTime.toISOString().slice(0, 10)} ~ ${d.endTime.toISOString().slice(0, 10)}`,
      );
    });
    console.log(`Phase A 基础段中枢数: ${duanChannels.phaseA.length}`);
    console.log(`Phase B 最终段中枢数: ${duanChannels.phaseB.length}`);
    duanChannels.phaseB.forEach((c, i) => {
      console.log(
        `  [段中枢 #${i + 1}] 包含段数: ${c.duans.length}, expanded: ${c.expanded}, ` +
          `区间 [ZD, ZG]: [${c.zd.toFixed(2)}, ${c.zg.toFixed(2)}], 极值 [DD, GG]: [${c.dd.toFixed(2)}, ${c.gg.toFixed(2)}], ` +
          `起止: ${c.duans[0].startTime.toISOString().slice(0, 10)} ~ ${c.duans[c.duans.length - 1].endTime.toISOString().slice(0, 10)}`,
      );
    });
    console.log(
      '===============================================================================\n',
    );
  });
});
