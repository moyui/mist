import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiStatus } from '../enums/bi.enum';

/**
 * 深入分析递推状态机为什么过滤掉了7/21-7/29的Valid候选笔
 */
describe('July 2025 Rollback Analysis', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should analyze why rollback filtered out 7/21-7/29 Valid bi', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );
    const candidates = (biService as any).generateCandidateBis(
      alternatingFenxings,
      mergedK,
    );
    const finalBis = biService.getBi(mergedK);

    // 找到所有与7/21-7/29相关的候选笔
    console.log('\n=== 候选笔 (7/15-8/10) ===');
    const nearbyCandidates = candidates.filter((c: any) => {
      const start = new Date(c.startTime).toISOString().split('T')[0];
      return start >= '2025-07-15' && start <= '2025-08-10';
    });
    nearbyCandidates.forEach((c: any, idx: number) => {
      const startDate = new Date(c.startTime).toISOString().split('T')[0];
      const endDate = new Date(c.endTime).toISOString().split('T')[0];
      const trend = c.trend === TrendDirection.Up ? '↑' : '↓';
      const status = c.status === BiStatus.Valid ? '✓Valid' : '✗Invalid';
      console.log(
        `候选笔[${idx}]: ${startDate} -> ${endDate}, ${trend}, ${status}`,
      );
      if (c.startFenxing && c.endFenxing) {
        console.log(
          `  Start ID: ${c.startFenxing.middleOriginId}, End ID: ${c.endFenxing.middleOriginId}`,
        );
      }
    });

    // 找到386->392这个候选笔在candidates数组中的索引
    console.log('\n=== 7/21-7/29候选笔分析 ===');
    const candidate386_392 = candidates.find((c: any) => {
      if (!c.startFenxing || !c.endFenxing) return false;
      return (
        c.startFenxing.middleOriginId === 386 &&
        c.endFenxing.middleOriginId === 392
      );
    });
    if (candidate386_392) {
      const idx = candidates.indexOf(candidate386_392);
      console.log(`✓ 找到7/21-7/29候选笔，索引: ${idx}`);
      console.log(
        `  状态: ${candidate386_392.status === BiStatus.Valid ? 'Valid' : 'Invalid'}`,
      );
      console.log(`  趋势: ${candidate386_392.trend}`);

      // 检查前后的候选笔
      if (idx > 0) {
        const prev = candidates[idx - 1];
        const prevStart = new Date(prev.startTime).toISOString().split('T')[0];
        const prevEnd = new Date(prev.endTime).toISOString().split('T')[0];
        const prevStatus = prev.status === BiStatus.Valid ? 'Valid' : 'Invalid';
        console.log(
          `  前一个候选笔: ${prevStart} -> ${prevEnd}, ${prevStatus}`,
        );
      }
      if (idx < candidates.length - 1) {
        const next = candidates[idx + 1];
        const nextStart = new Date(next.startTime).toISOString().split('T')[0];
        const nextEnd = new Date(next.endTime).toISOString().split('T')[0];
        const nextStatus = next.status === BiStatus.Valid ? 'Valid' : 'Invalid';
        console.log(
          `  后一个候选笔: ${nextStart} -> ${nextEnd}, ${nextStatus}`,
        );
      }
    }

    // 检查最终笔数据
    console.log('\n=== 最终笔数据 (7/15-8/10) ===');
    const nearbyFinalBis = finalBis.filter((b: any) => {
      const start = new Date(b.startTime).toISOString().split('T')[0];
      return start >= '2025-07-15' && start <= '2025-08-10';
    });
    nearbyFinalBis.forEach((b: any, idx: number) => {
      const startDate = new Date(b.startTime).toISOString().split('T')[0];
      const endDate = new Date(b.endTime).toISOString().split('T')[0];
      const trend = b.trend === TrendDirection.Up ? '↑' : '↓';
      const status = b.status === BiStatus.Valid ? '✓Valid' : '✗Invalid';
      console.log(
        `最终笔[${idx}]: ${startDate} -> ${endDate}, ${trend}, ${status}`,
      );
      if (b.startFenxing && b.endFenxing) {
        console.log(
          `  Start ID: ${b.startFenxing.middleOriginId}, End ID: ${b.endFenxing.middleOriginId}`,
        );
      }
    });

    // 检查7/21之前的笔，看看是否和7/21-7/29发生了合并
    console.log('\n=== 检查7/21之前的笔 ===');
    const biBefore721 = finalBis.find((b: any) => {
      const end = new Date(b.endTime).toISOString().split('T')[0];
      return end <= '2025-07-21';
    });
    if (biBefore721) {
      const start = new Date(biBefore721.startTime).toISOString().split('T')[0];
      const end = new Date(biBefore721.endTime).toISOString().split('T')[0];
      console.log(`7/21之前的最后一笔: ${start} -> ${end}`);
      if (biBefore721.startFenxing && biBefore721.endFenxing) {
        console.log(
          `  Start ID: ${biBefore721.startFenxing.middleOriginId}, End ID: ${biBefore721.endFenxing.middleOriginId}`,
        );
      }
    }

    // 关键检查：看看7/21-7/29的候选笔是否被三笔合并规则处理掉了
    console.log('\n=== 三笔合并规则分析 ===');
    const idx386_392 = candidates.findIndex((c: any) => {
      if (!c.startFenxing || !c.endFenxing) return false;
      return (
        c.startFenxing.middleOriginId === 386 &&
        c.endFenxing.middleOriginId === 392
      );
    });

    if (idx386_392 > 0) {
      const bi1 = candidates[idx386_392 - 2];
      const bi2 = candidates[idx386_392 - 1];
      const bi3 = candidates[idx386_392];

      if (bi1 && bi2 && bi3) {
        console.log('检查三笔合并：');
        const start1 = new Date(bi1.startTime).toISOString().split('T')[0];
        const end1 = new Date(bi1.endTime).toISOString().split('T')[0];
        const start2 = new Date(bi2.startTime).toISOString().split('T')[0];
        const end2 = new Date(bi2.endTime).toISOString().split('T')[0];
        const start3 = new Date(bi3.startTime).toISOString().split('T')[0];
        const end3 = new Date(bi3.endTime).toISOString().split('T')[0];

        console.log(
          `  bi1: ${start1} -> ${end1}, ${bi1.trend}, valid=${bi1.status === BiStatus.Valid}`,
        );
        console.log(
          `  bi2: ${start2} -> ${end2}, ${bi2.trend}, valid=${bi2.status === BiStatus.Valid}`,
        );
        console.log(
          `  bi3: ${start3} -> ${end3}, ${bi3.trend}, valid=${bi3.status === BiStatus.Valid}`,
        );

        if (bi1.startFenxing && bi2.endFenxing && bi3.endFenxing) {
          console.log(`  bi1 Start ID: ${bi1.startFenxing.middleOriginId}`);
          console.log(`  bi2 End ID: ${bi2.endFenxing.middleOriginId}`);
          console.log(`  bi3 End ID: ${bi3.endFenxing.middleOriginId}`);
        }
      }
    }

    expect(true).toBe(true);
  });
});
