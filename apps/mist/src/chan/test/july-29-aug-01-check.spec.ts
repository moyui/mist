import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
import { FenxingType } from '../enums/fenxing.enum';

/**
 * 检查7/29->8/01的宽笔条件
 */
describe('July 29 to Aug 1 Wide Bi Check', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should check why 7/29->8/01 is Invalid', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);
    const alternatingFenxings = (biService as any).createAlternatingSequence(
      allFenxings,
    );

    // 找到7/29的顶分型和8/01的底分型
    const topFenxing = alternatingFenxings.find(
      (f: any) => f.middleOriginId === 392,
    );
    const bottomFenxing = alternatingFenxings.find(
      (f: any) => f.middleOriginId === 395,
    );

    console.log('\n=== 7/29顶分型 ===');
    if (topFenxing) {
      const mk = mergedK[topFenxing.middleIndex];
      console.log(`日期: ${new Date(mk.endTime).toISOString().split('T')[0]}`);
      console.log(
        `类型: ${topFenxing.type === FenxingType.Top ? '顶分型' : '底分型'}`,
      );
      console.log(`中间K线ID: ${topFenxing.middleOriginId}`);
      console.log(
        `包含的原始K线IDs: [${topFenxing.leftIds.join(', ')}] [${topFenxing.middleIds.join(', ')}] [${topFenxing.rightIds.join(', ')}]`,
      );
    }

    console.log('\n=== 8/01底分型 ===');
    if (bottomFenxing) {
      const mk = mergedK[bottomFenxing.middleIndex];
      console.log(`日期: ${new Date(mk.endTime).toISOString().split('T')[0]}`);
      console.log(
        `类型: ${bottomFenxing.type === FenxingType.Top ? '顶分型' : '底分型'}`,
      );
      console.log(`中间K线ID: ${bottomFenxing.middleOriginId}`);
      console.log(
        `包含的原始K线IDs: [${bottomFenxing.leftIds.join(', ')}] [${bottomFenxing.middleIds.join(', ')}] [${bottomFenxing.rightIds.join(', ')}]`,
      );
    }

    // 检查宽笔条件
    if (topFenxing && bottomFenxing) {
      console.log('\n=== 宽笔条件检查 ===');

      // 条件1：检查是否有共用K线
      const topFenxingIds = new Set([
        ...topFenxing.leftIds,
        ...topFenxing.middleIds,
        ...topFenxing.rightIds,
      ]);
      const bottomFenxingIds = new Set([
        ...bottomFenxing.leftIds,
        ...bottomFenxing.middleIds,
        ...bottomFenxing.rightIds,
      ]);

      let hasShared = false;
      for (const id of topFenxingIds) {
        if (bottomFenxingIds.has(id)) {
          hasShared = true;
          break;
        }
      }

      console.log(
        `条件1（无共用K线）: ${!hasShared ? '✓ 满足' : '✗ 不满足（有共用K线）'}`,
      );

      // 条件2：顶分型最高K线和底分型最低K线之间（不包括这两根）
      // 至少有3根K线
      const startId = topFenxing.middleOriginId;
      const endId = bottomFenxing.middleOriginId;
      const minId = Math.min(startId, endId);
      const maxId = Math.max(startId, endId);
      const betweenCount = maxId - minId - 1;

      console.log(`条件2（中间>=3根K线）:`);
      console.log(`  顶分型最高K线ID: ${startId}`);
      console.log(`  底分型最低K线ID: ${endId}`);
      console.log(`  中间K线数量: ${betweenCount}`);
      console.log(
        `  ${betweenCount >= 3 ? '✓ 满足' : '✗ 不满足（需要>=3，实际=' + betweenCount + '）'}`,
      );

      const isWide = !hasShared && betweenCount >= 3;
      console.log(`\n是否满足宽笔条件: ${isWide ? '✓ 是宽笔' : '✗ 不是宽笔'}`);

      // 列出中间的K线
      console.log(`\n中间的K线:`);
      for (let id = minId + 1; id < maxId; id++) {
        const k = shanghaiIndexData2024_2025.find((k) => k.id === id);
        if (k) {
          const date = new Date(k.time).toISOString().split('T')[0];
          console.log(`  ID ${id}: ${date}, H:${k.highest} L:${k.lowest}`);
        }
      }
    }

    expect(true).toBe(true);
  });
});
