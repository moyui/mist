import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';

/**
 * 最终分析：为什么bi114+bi115+bi116错误地合并了
 */
describe('July 2025 Final Root Cause', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should show why bi114+bi115+bi116 incorrectly merged', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );
    const candidates = (biService as any).generateCandidateBis(
      alternatingFenxings,
      mergedK,
    );

    // bi114: 7/08->7/10, ↑, Invalid
    // bi115: 7/10->7/21, ↓, Valid
    // bi116: 7/21->7/29, ↑, Valid
    const bi114 = candidates[114];
    const bi115 = candidates[115];
    const bi116 = candidates[116];

    console.log('\n=== bi114+bi115+bi116 三笔合并分析 ===');
    console.log(`bi114: 7/08->7/10, ↑, Invalid`);
    console.log(`bi115: 7/10->7/21, ↓, Valid`);
    console.log(`bi116: 7/21->7/29, ↑, Valid`);

    // 检查模式
    const isUpDownUp =
      bi114.trend === TrendDirection.Up &&
      bi115.trend === TrendDirection.Down &&
      bi116.trend === TrendDirection.Up;
    console.log(`\n模式: up-down-up = ${isUpDownUp}`);

    // 检查三笔合并条件
    if (
      bi114.startFenxing &&
      bi114.endFenxing &&
      bi115.startFenxing &&
      bi115.endFenxing &&
      bi116.startFenxing &&
      bi116.endFenxing
    ) {
      console.log(`\n=== 分型极值 ===`);
      console.log(`bi114.start.lowest: ${bi114.startFenxing.lowest}`);
      console.log(`bi114.start.highest: ${bi114.startFenxing.highest}`);
      console.log(`bi114.end.lowest: ${bi114.endFenxing.lowest}`);
      console.log(`bi114.end.highest: ${bi114.endFenxing.highest}`);
      console.log(`bi115.start.lowest: ${bi115.startFenxing.lowest}`);
      console.log(`bi115.start.highest: ${bi115.startFenxing.highest}`);
      console.log(`bi115.end.lowest: ${bi115.endFenxing.lowest}`);
      console.log(`bi115.end.highest: ${bi115.endFenxing.highest}`);
      console.log(`bi116.start.lowest: ${bi116.startFenxing.lowest}`);
      console.log(`bi116.start.highest: ${bi116.startFenxing.highest}`);
      console.log(`bi116.end.lowest: ${bi116.endFenxing.lowest}`);
      console.log(`bi116.end.highest: ${bi116.endFenxing.highest}`);

      console.log(`\n=== up-down-up 合并条件检查 ===`);
      const cond1 = bi114.startFenxing.lowest <= bi115.endFenxing.lowest;
      const cond2 = bi115.startFenxing.highest <= bi116.endFenxing.highest;
      const canMergeThree = cond1 && cond2;

      console.log(
        `条件1: bi114.start.lowest(${bi114.startFenxing.lowest}) <= bi115.end.lowest(${bi115.endFenxing.lowest}): ${cond1}`,
      );
      console.log(
        `条件2: bi115.start.highest(${bi115.startFenxing.highest}) <= bi116.end.highest(${bi116.endFenxing.highest}): ${cond2}`,
      );
      console.log(`\n能否三笔合并: ${canMergeThree}`);

      if (canMergeThree) {
        console.log(`\n⚠️ 问题根源：bi114+bi115+bi116满足三笔合并条件！`);
        console.log(`   bi114和bi116会被合并，导致：`);
        console.log(`   1. bi115（下降笔）和合并后的上升笔之间没有交替`);
        console.log(`   2. 可能触发进一步合并`);
        console.log(`   3. 最终bi116（7/21-7/29宽笔）被“吃掉”`);
      }

      // 手动检查两笔合并
      console.log(`\n=== 检查bi114和bi116能否两笔合并 ===`);
      const canMergeTwo =
        bi114.trend === bi116.trend &&
        bi114.startFenxing.lowest < bi116.endFenxing.lowest &&
        bi114.endFenxing.highest < bi116.endFenxing.highest;
      console.log(`同趋势: ${bi114.trend === bi116.trend}`);
      console.log(
        `起点的lowest < 终点的lowest: ${bi114.startFenxing.lowest} < ${bi116.endFenxing.lowest}: ${bi114.startFenxing.lowest < bi116.endFenxing.lowest}`,
      );
      console.log(
        `起点的highest < 终点的highest: ${bi114.endFenxing.highest} < ${bi116.endFenxing.highest}: ${bi114.endFenxing.highest < bi116.endFenxing.highest}`,
      );
      console.log(`能否两笔合并: ${canMergeTwo}`);
    }

    expect(true).toBe(true);
  });
});
