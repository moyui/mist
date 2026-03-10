import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
import { FenxingType } from '../enums/fenxing.enum';
import { BiStatus } from '../enums/bi.enum';

/**
 * 根本原因分析：为什么7/21-7/29宽笔没有被识别
 */
describe('July 2025 Root Cause Analysis', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should find root cause of missing 7/21-7/29 wide bi', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );

    console.log('\n=== 所有原始分型 (7/18-8/01) ===');
    allFenxings.forEach((f: any, idx: number) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      if (date >= '2025-07-18' && date <= '2025-08-01') {
        const type = f.type === FenxingType.Top ? '顶' : '底';
        console.log(`[${idx}] ${date} ${type}分型, ID:${f.middleOriginId}`);
      }
    });

    console.log('\n=== 交替后的分型序列 (7/18-8/01) ===');
    alternatingFenxings.forEach((f: any, idx: number) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      if (date >= '2025-07-18' && date <= '2025-08-01') {
        const type = f.type === FenxingType.Top ? '顶' : '底';
        console.log(`[${idx}] ${date} ${type}分型, ID:${f.middleOriginId}`);
      }
    });

    // 检查7/21底分型(386)和7/29顶分型(392)在交替序列中的位置
    console.log('\n=== 关键分型位置查找 ===');
    const fenxing386 = alternatingFenxings.find(
      (f: any) => f.middleOriginId === 386,
    );
    const fenxing392 = alternatingFenxings.find(
      (f: any) => f.middleOriginId === 392,
    );

    if (fenxing386) {
      const mk386 = mergedK[fenxing386.middleIndex];
      console.log(
        `✓ 7/21底分型(ID:386)在交替序列中, 日期:${new Date(mk386.endTime).toISOString().split('T')[0]}`,
      );
    } else {
      console.log(`✗ 7/21底分型(ID:386)不在交替序列中!`);
    }

    if (fenxing392) {
      const mk392 = mergedK[fenxing392.middleIndex];
      console.log(
        `✓ 7/29顶分型(ID:392)在交替序列中, 日期:${new Date(mk392.endTime).toISOString().split('T')[0]}`,
      );
    } else {
      console.log(`✗ 7/29顶分型(ID:392)不在交替序列中!`);
    }

    // 查找7/21和7/29之间的所有分型
    console.log('\n=== 7/21和7/29之间的分型 ===');
    const betweenFenxings = alternatingFenxings.filter((f: any) => {
      return f.middleOriginId > 386 && f.middleOriginId < 392;
    });
    betweenFenxings.forEach((f: any) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      const type = f.type === FenxingType.Top ? '顶' : '底';
      console.log(`  ${date} ${type}分型, ID:${f.middleOriginId}`);
    });

    // 检查候选笔生成
    console.log('\n=== 候选笔检查 ===');
    const candidates = (biService as any).generateCandidateBis(
      alternatingFenxings,
      mergedK,
    );
    const targetCandidates = candidates.filter((c: any) => {
      const start = new Date(c.startTime).toISOString().split('T')[0];
      return start >= '2025-07-15' && start <= '2025-08-05';
    });
    targetCandidates.forEach((c: any, idx: number) => {
      const startDate = new Date(c.startTime).toISOString().split('T')[0];
      const endDate = new Date(c.endTime).toISOString().split('T')[0];
      const status = c.status === BiStatus.Valid ? 'Valid' : 'Invalid';
      console.log(`候选笔[${idx}]: ${startDate} -> ${endDate}, ${status}`);
      if (c.startFenxing && c.endFenxing) {
        console.log(
          `  Start ID: ${c.startFenxing.middleOriginId}, End ID: ${c.endFenxing.middleOriginId}`,
        );
      }
    });

    // 检查386和392之间是否有候选笔
    console.log('\n=== 386和392之间的候选笔 ===');
    const biBetween = candidates.find((c: any) => {
      if (!c.startFenxing || !c.endFenxing) return false;
      return (
        c.startFenxing.middleOriginId === 386 &&
        c.endFenxing.middleOriginId === 392
      );
    });
    if (biBetween) {
      console.log('✓ 找到386->392的候选笔');
      console.log(
        `  Status: ${biBetween.status === BiStatus.Valid ? 'Valid' : 'Invalid'}`,
      );
    } else {
      console.log('✗ 没有找到386->392的候选笔');
    }

    // 检查原始分型中386和392之间是否有同类型分型
    console.log('\n=== 原始分型中386和392之间的同类型分型 ===');
    const sameTypeFenxings = allFenxings.filter((f: any) => {
      if (!fenxing386) return false;
      return (
        f.middleOriginId > 386 &&
        f.middleOriginId < 392 &&
        f.type === fenxing386.type
      );
    });
    sameTypeFenxings.forEach((f: any) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      const type = f.type === FenxingType.Top ? '顶' : '底';
      console.log(`  ${date} ${type}分型, ID:${f.middleOriginId}`);
    });

    expect(true).toBe(true);
  });
});
