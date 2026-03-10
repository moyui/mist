import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiStatus } from '../enums/bi.enum';

/**
 * 分析bi0: 为什么在bi2时没有触发bi0+bi1+bi2的合并
 */
describe('July 2025 Bi0 Analysis', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should analyze why bi0+bi1+bi2 merge did not happen at bi2', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );
    const candidates = (biService as any).generateCandidateBis(
      alternatingFenxings,
      mergedK,
    );

    // 找到7/08->7/10 (bi1)的索引
    const idx_bi1 = candidates.findIndex((c: any) => {
      const start = new Date(c.startTime).toISOString().split('T')[0];
      return start === '2025-07-08';
    });

    console.log('\n=== 关键候选笔序列 ===');
    candidates.forEach((c: any, idx: number) => {
      if (idx >= idx_bi1 - 2 && idx <= idx_bi1 + 2) {
        const startDate = new Date(c.startTime).toISOString().split('T')[0];
        const endDate = new Date(c.endTime).toISOString().split('T')[0];
        const trend = c.trend === TrendDirection.Up ? '↑' : '↓';
        const status = c.status === BiStatus.Valid ? '✓' : '✗';
        console.log(
          `候选笔[${idx}]: ${startDate} -> ${endDate}, ${trend}, ${status}`,
        );
        if (c.startFenxing && c.endFenxing) {
          console.log(
            `  Start ID: ${c.startFenxing.middleOriginId}, End ID: ${c.endFenxing.middleOriginId}`,
          );
        }
      }
    });

    if (idx_bi1 >= 2) {
      const bi0 = candidates[idx_bi1 - 2];
      const bi1 = candidates[idx_bi1 - 1];
      const bi2 = candidates[idx_bi1];

      console.log('\n=== bi0+bi1+bi2 三笔分析 ===');
      const start0 = new Date(bi0.startTime).toISOString().split('T')[0];
      const end0 = new Date(bi0.endTime).toISOString().split('T')[0];
      const start1 = new Date(bi1.startTime).toISOString().split('T')[0];
      const end1 = new Date(bi1.endTime).toISOString().split('T')[0];
      const start2 = new Date(bi2.startTime).toISOString().split('T')[0];
      const end2 = new Date(bi2.endTime).toISOString().split('T')[0];

      console.log(
        `bi0: ${start0} -> ${end0}, ${bi0.trend}, valid=${bi0.status === BiStatus.Valid}`,
      );
      console.log(
        `bi1: ${start1} -> ${end1}, ${bi1.trend}, valid=${bi1.status === BiStatus.Valid}`,
      );
      console.log(
        `bi2: ${start2} -> ${end2}, ${bi2.trend}, valid=${bi2.status === BiStatus.Valid}`,
      );

      // 检查是否是down-up-down或up-down-up模式
      const isDownUpDown =
        bi0.trend === TrendDirection.Down &&
        bi1.trend === TrendDirection.Up &&
        bi2.trend === TrendDirection.Down;
      const isUpDownUp =
        bi0.trend === TrendDirection.Up &&
        bi1.trend === TrendDirection.Down &&
        bi2.trend === TrendDirection.Up;

      console.log(`\n模式检查:`);
      console.log(`  down-up-down: ${isDownUpDown}`);
      console.log(`  up-down-up: ${isUpDownUp}`);

      // 检查是否能三笔合并
      if (
        bi0.startFenxing &&
        bi0.endFenxing &&
        bi1.startFenxing &&
        bi1.endFenxing &&
        bi2.startFenxing &&
        bi2.endFenxing
      ) {
        // 检查合并条件
        let canMerge = false;
        if (isUpDownUp) {
          const cond1 = bi0.startFenxing.lowest <= bi1.endFenxing.lowest;
          const cond2 = bi1.startFenxing.highest <= bi2.endFenxing.highest;
          canMerge = cond1 && cond2;
          console.log(`  up-down-up合并条件:`);
          console.log(
            `    bi0.start.lowest(${bi0.startFenxing.lowest}) <= bi1.end.lowest(${bi1.endFenxing.lowest}): ${cond1}`,
          );
          console.log(
            `    bi1.start.highest(${bi1.startFenxing.highest}) <= bi2.end.highest(${bi2.endFenxing.highest}): ${cond2}`,
          );
        } else if (isDownUpDown) {
          const cond1 = bi0.startFenxing.highest >= bi1.endFenxing.highest;
          const cond2 = bi1.startFenxing.lowest >= bi2.endFenxing.lowest;
          canMerge = cond1 && cond2;
          console.log(`  down-up-down合并条件:`);
          console.log(
            `    bi0.start.highest(${bi0.startFenxing.highest}) >= bi1.end.highest(${bi1.endFenxing.highest}): ${cond1}`,
          );
          console.log(
            `    bi1.start.lowest(${bi1.startFenxing.lowest}) >= bi2.end.lowest(${bi2.endFenxing.lowest}): ${cond2}`,
          );
        }
        console.log(`  能否三笔合并: ${canMerge}`);

        if (!canMerge) {
          console.log(`\n⚠️ 关键发现：bi0+bi1+bi2无法三笔合并！`);
          console.log(`   这就是为什么bi2没有被合并，后续影响到了bi3`);
        }
      }
    }

    expect(true).toBe(true);
  });
});
