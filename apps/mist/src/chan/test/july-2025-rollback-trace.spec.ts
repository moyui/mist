import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiStatus } from '../enums/bi.enum';

/**
 * 直接追踪递推状态机的执行过程
 */
describe('July 2025 Rollback Trace', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should trace the exact rollback process', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );
    const candidates = (biService as any).generateCandidateBis(
      alternatingFenxings,
      mergedK,
    );

    // 找到包含bi114-bi116的候选笔范围
    const targetStart = 110; // 从bi110开始
    const targetEnd = 120; // 到bi120结束

    console.log('\n=== 模拟递推状态机处理 ===');
    console.log('处理候选笔范围: [' + targetStart + ', ' + targetEnd + ']');

    let confirmed: any[] = [];
    let pending: any[] = [];

    // 模拟从bi110开始处理
    for (let i = targetStart; i <= targetEnd; i++) {
      const bi3 = candidates[i];
      if (!bi3) continue;

      const startDate = new Date(bi3.startTime).toISOString().split('T')[0];
      const endDate = new Date(bi3.endTime).toISOString().split('T')[0];
      const trend = bi3.trend === TrendDirection.Up ? '↑' : '↓';
      const status = bi3.status === BiStatus.Valid ? '✓' : '✗';

      console.log(
        `\n--- 处理候选笔[${i}]: ${startDate} -> ${endDate}, ${trend}, ${status} ---`,
      );

      const { bi: bi2, from: bi2From } = (biService as any).getLastBi(
        pending,
        confirmed,
      );
      const { bi: bi1, from: bi1From } = (biService as any).getLastLastBi(
        pending,
        confirmed,
        bi2From,
      );

      const bi3Valid = bi3.status === BiStatus.Valid;

      console.log(`当前状态:`);
      console.log(`  confirmed: ${confirmed.length}笔`);
      console.log(`  pending: ${pending.length}笔`);

      if (bi1 && bi2 && bi3) {
        const bi1Valid = bi1.status === BiStatus.Valid;
        const bi2Valid = bi2.status === BiStatus.Valid;

        const s1 = new Date(bi1.startTime).toISOString().split('T')[0];
        const e1 = new Date(bi1.endTime).toISOString().split('T')[0];
        const s2 = new Date(bi2.startTime).toISOString().split('T')[0];
        const e2 = new Date(bi2.endTime).toISOString().split('T')[0];

        console.log(`  bi1 (${bi1From}): ${s1} -> ${e1}, valid=${bi1Valid}`);
        console.log(`  bi2 (${bi2From}): ${s2} -> ${e2}, valid=${bi2Valid}`);
        console.log(`  bi3: valid=${bi3Valid}`);

        if (bi1Valid && bi2Valid && bi3Valid) {
          console.log(`  动作: 三笔都Valid，直接加入confirmed`);
          (biService as any).removeBiByFrom(
            pending,
            confirmed,
            bi1From,
            bi2From,
          );
          confirmed = [...confirmed, bi1, bi2, bi3];
          pending = [...pending];
        } else {
          console.log(`  动作: 存在Invalid笔，检查三笔合并`);
          const result = (biService as any).handleThreeBi(
            bi1,
            bi2,
            bi3,
            mergedK,
          );

          if (result.status === 'merge') {
            console.log(`    结果: 三笔合并！`);
            console.log(
              `    合并笔: ${new Date(result.bi.startTime).toISOString().split('T')[0]} -> ${new Date(result.bi.endTime).toISOString().split('T')[0]}`,
            );
            (biService as any).removeBiByFrom(
              pending,
              confirmed,
              bi1From,
              bi2From,
            );
            const pushResult = (biService as any).pushBi(
              pending,
              confirmed,
              result.bi,
            );
            confirmed = pushResult.confirmed;
            pending = pushResult.pending;
          } else {
            console.log(`    结果: 无法合并，keepAll`);
            if (bi3Valid) {
              console.log(`    bi3是Valid，加入confirmed`);
              (biService as any).removeBiByFrom(
                pending,
                confirmed,
                bi1From,
                bi2From,
              );
              confirmed = [...confirmed, bi1, bi2, bi3];
              pending = [...pending];
            } else {
              console.log(`    bi3是Invalid，加入pending`);
              confirmed = [...confirmed];
              pending = [...pending, bi3];
            }
          }
        }
      } else {
        console.log(`  不足三笔，直接加入pending`);
        confirmed = [...confirmed];
        pending = [...pending, bi3];
      }

      console.log(`处理后:`);
      console.log(`  confirmed: ${confirmed.length}笔`);
      console.log(`  pending: ${pending.length}笔`);
    }

    console.log('\n=== 最终结果 ===');
    console.log(`confirmed笔数: ${confirmed.length}`);
    confirmed.forEach((bi, idx) => {
      const start = new Date(bi.startTime).toISOString().split('T')[0];
      const end = new Date(bi.endTime).toISOString().split('T')[0];
      console.log(`  [${idx}] ${start} -> ${end}`);
    });

    // 对比实际结果
    const finalBis = biService.getBi(mergedK);
    console.log(`\n实际结果笔数: ${finalBis.length}`);
    const nearbyFinalBis = finalBis.filter((b: any) => {
      const start = new Date(b.startTime).toISOString().split('T')[0];
      return start >= '2025-07-08' && start <= '2025-08-05';
    });
    console.log(`7/08-8/05区间笔数: ${nearbyFinalBis.length}`);
    nearbyFinalBis.forEach((bi: any, idx: number) => {
      const start = new Date(bi.startTime).toISOString().split('T')[0];
      const end = new Date(bi.endTime).toISOString().split('T')[0];
      console.log(`  [${idx}] ${start} -> ${end}`);
    });

    expect(true).toBe(true);
  });
});
