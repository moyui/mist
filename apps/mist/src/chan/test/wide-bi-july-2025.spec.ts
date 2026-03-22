import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../services/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';
import { FenxingType } from '../enums/fenxing.enum';

/**
 * Debug test for wide bi issue: 2025-07-21 to 2025-07-29
 *
 * This test helps investigate why a wide bi is not being identified
 * for the period from 2025-07-21 to 2025-07-29.
 */
describe('Wide Bi July 2025 Debug Test', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should debug wide bi identification for 2025-07-21 to 2025-07-29', () => {
    // Find the data range for analysis
    const startIndex = shanghaiIndexData2024_2025.findIndex((k) => {
      const date = new Date(k.time).toISOString().split('T')[0];
      return date >= '2025-07-15';
    });
    const endIndex = shanghaiIndexData2024_2025.findIndex((k) => {
      const date = new Date(k.time).toISOString().split('T')[0];
      return date >= '2025-08-05';
    });

    const analysisData = shanghaiIndexData2024_2025.slice(
      startIndex > 0 ? startIndex - 10 : 0,
      endIndex > 0 ? endIndex + 5 : shanghaiIndexData2024_2025.length,
    );

    // Merge K-lines
    const mergedK = kMergeService.merge(analysisData);

    console.log('\n=== 2025-07-21 到 2025-07-29 的原始K线数据 ===');
    const targetData = shanghaiIndexData2024_2025.filter((k) => {
      const date = new Date(k.time).toISOString().split('T')[0];
      return date >= '2025-07-21' && date <= '2025-07-29';
    });
    targetData.forEach((k, idx) => {
      const date = new Date(k.time).toISOString().split('T')[0];
      console.log(
        `${idx + 1}. [${date}] ID:${k.id} H:${k.highest} L:${k.lowest} C:${k.close}`,
      );
    });

    console.log('\n=== 合并后的K线 (7/15-8/5) ===');
    mergedK.forEach((mk, idx) => {
      const startDate = new Date(mk.startTime).toISOString().split('T')[0];
      const endDate = new Date(mk.endTime).toISOString().split('T')[0];
      console.log(
        `合并K[${idx}]: ${startDate} ~ ${endDate}, 包含${mk.mergedCount}根原始K, H:${mk.highest} L:${mk.lowest}`,
      );
      if (mk.mergedCount > 1) {
        console.log(`  原始K线IDs: ${mk.mergedIds.join(', ')}`);
      }
    });

    // Get all fenxings
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);

    console.log('\n=== 所有识别到的分型 ===');
    allFenxings.forEach((f: any, idx: number) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      const type = f.type === FenxingType.Top ? '顶分型' : '底分型';
      console.log(`分型[${idx}]: ${date} (${type})`);
      console.log(`  中间K线ID: ${f.middleOriginId}`);
      console.log(
        `  包含的原始K线IDs: [${f.leftIds.join(', ')}] [${f.middleIds.join(', ')}] [${f.rightIds.join(', ')}]`,
      );
    });

    // Get bi
    const bis = biService.getBi(mergedK);

    console.log('\n=== 识别到的笔 ===');
    bis.forEach((bi: any, idx: number) => {
      const startDate = new Date(bi.startTime).toISOString().split('T')[0];
      const endDate = new Date(bi.endTime).toISOString().split('T')[0];
      const trend = bi.trend === TrendDirection.Up ? '上升' : '下降';
      const status = bi.status === 1 ? 'Valid' : 'Invalid';
      console.log(
        `笔[${idx}]: ${startDate} -> ${endDate} (${trend}), 状态: ${status}`,
      );
      console.log(`  包含原始K线数: ${bi.originIds.length}`);
      if (bi.startFenxing && bi.endFenxing) {
        console.log(
          `  起始分型K线ID: ${bi.startFenxing.middleOriginId}, 结束分型K线ID: ${bi.endFenxing.middleOriginId}`,
        );

        // Manual wide bi check
        const startId = bi.startFenxing.middleOriginId;
        const endId = bi.endFenxing.middleOriginId;
        const minId = Math.min(startId, endId);
        const maxId = Math.max(startId, endId);
        const betweenCount = maxId - minId - 1;

        // Check for shared K-lines
        const startIds = new Set([
          ...bi.startFenxing.leftIds,
          ...bi.startFenxing.middleIds,
          ...bi.startFenxing.rightIds,
        ]);
        const endIds = new Set([
          ...bi.endFenxing.leftIds,
          ...bi.endFenxing.middleIds,
          ...bi.endFenxing.rightIds,
        ]);
        let hasShared = false;
        for (const id of startIds) {
          if (endIds.has(id)) {
            hasShared = true;
            break;
          }
        }

        console.log(
          `  宽笔检查1(无共用K线): ${!hasShared ? '✓' : '✗ (有共用K线)'}`,
        );
        console.log(
          `  宽笔检查2(中间>=3根K线): ${betweenCount >= 3 ? `✓ (${betweenCount}根)` : `✗ (${betweenCount}根)`}`,
        );
      }
    });

    // Focus on 7/21 to 7/29 period
    console.log('\n=== 重点分析 7/21 到 7/29 ===');
    const targetBis = bis.filter((bi: any) => {
      const start = new Date(bi.startTime);
      const end = new Date(bi.endTime);
      return start <= new Date('2025-07-29') && end >= new Date('2025-07-21');
    });

    if (targetBis.length > 0) {
      console.log(`找到 ${targetBis.length} 笔跨越或包含这段区间:`);
      targetBis.forEach((bi: any, idx: number) => {
        const startDate = new Date(bi.startTime).toISOString().split('T')[0];
        const endDate = new Date(bi.endTime).toISOString().split('T')[0];
        console.log(
          `笔[${idx + 1}]: ${startDate} -> ${endDate}, 状态: ${bi.status === 1 ? 'Valid' : 'Invalid'}`,
        );
      });
    } else {
      console.log('❌ 没有找到跨越 7/21-7/29 的笔!');

      // Check nearby fenxings
      const nearbyFenxings = allFenxings.filter((f: any) => {
        const mk = mergedK[f.middleIndex];
        const date = new Date(mk.endTime).toISOString().split('T')[0];
        return date >= '2025-07-18' && date <= '2025-08-01';
      });

      console.log('\n附近的分型:');
      nearbyFenxings.forEach((f: any, idx: number) => {
        const mk = mergedK[f.middleIndex];
        const date = new Date(mk.endTime).toISOString().split('T')[0];
        const type = f.type === FenxingType.Top ? '顶分型' : '底分型';
        console.log(`${idx + 1}. ${date} ${type}, K线ID: ${f.middleOriginId}`);

        // Check if this fenxing and next can form a wide bi
        if (idx < nearbyFenxings.length - 1) {
          const nextF = nearbyFenxings[idx + 1];
          const startId = f.middleOriginId;
          const endId = nextF.middleOriginId;
          const minId = Math.min(startId, endId);
          const maxId = Math.max(startId, endId);
          const betweenCount = maxId - minId - 1;

          const startIds = new Set([
            ...f.leftIds,
            ...f.middleIds,
            ...f.rightIds,
          ]);
          const endIds = new Set([
            ...nextF.leftIds,
            ...nextF.middleIds,
            ...nextF.rightIds,
          ]);
          let hasShared = false;
          for (const id of startIds) {
            if (endIds.has(id)) {
              hasShared = true;
              break;
            }
          }

          const cond1 = !hasShared;
          const cond2 = betweenCount >= 3;
          const canFormWide = cond1 && cond2;

          console.log(
            `  -> 和下一个分型: 中间${betweenCount}根K线, ${hasShared ? '有共用K线' : '无共用K线'}, ${canFormWide ? '✓可以构成宽笔' : '✗不能构成宽笔'}`,
          );
        }
      });
    }

    // This test is for debugging purposes, so it should always pass
    expect(true).toBe(true);
  });
});
