import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from './fixtures/shanghai-index-2024-2025.fixture';
import { FenxingType } from '../enums/fenxing.enum';

/**
 * 详细分析2025年7月21日到7月29日宽笔问题
 */
describe('July 2025 Wide Bi Detailed Analysis', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should analyze why 7/21-7/29 wide bi is not identified', () => {
    const mergedK = kMergeService.merge(shanghaiIndexData2024_2025);
    const allFenxings = (biService as any).getAllRawFenxings(mergedK);

    console.log('\n=== 原始K线 7/21-7/29 ===');
    shanghaiIndexData2024_2025.forEach((k) => {
      const date = new Date(k.time).toISOString().split('T')[0];
      if (date >= '2025-07-19' && date <= '2025-08-02') {
        console.log(
          `ID ${k.id}: ${date}, H:${k.highest} L:${k.lowest} C:${k.close}`,
        );
      }
    });

    console.log('\n=== 合并K线 7/18-8/01 ===');
    mergedK.forEach((mk, idx) => {
      const startDate = new Date(mk.startTime).toISOString().split('T')[0];
      const endDate = new Date(mk.endTime).toISOString().split('T')[0];
      if (startDate >= '2025-07-18' && startDate <= '2025-08-01') {
        console.log(`MergedK[${idx}]: ${startDate} ~ ${endDate}`);
        console.log(`  H:${mk.highest} L:${mk.lowest}`);
        console.log(`  Merged IDs: [${mk.mergedIds.join(', ')}]`);
      }
    });

    console.log('\n=== 所有分型 (7/18-8/01) ===');
    allFenxings.forEach((f: any, idx: number) => {
      const mk = mergedK[f.middleIndex];
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      if (date >= '2025-07-18' && date <= '2025-08-01') {
        const type = f.type === FenxingType.Top ? '顶分型' : '底分型';
        console.log(`分型[${idx}]: ${date} (${type})`);
        console.log(`  中间K线ID: ${f.middleOriginId}`);
        console.log(
          `  包含的原始K线IDs: [${f.leftIds.join(', ')}] [${f.middleIds.join(', ')}] [${f.rightIds.join(', ')}]`,
        );
      }
    });

    // 检查ID 386 (7/21) 和 ID 392 (7/29) 所在的合并K线位置
    console.log('\n=== 关键位置分析 ===');
    const id386Index = mergedK.findIndex((mk) => mk.mergedIds.includes(386));
    const id392Index = mergedK.findIndex((mk) => mk.mergedIds.includes(392));

    console.log(`ID 386 (7/21) 在 MergedK[${id386Index}]`);
    console.log(`ID 392 (7/29) 在 MergedK[${id392Index}]`);

    // 检查这些位置是否能形成分型
    if (id386Index >= 1 && id386Index < mergedK.length - 1) {
      const prev = mergedK[id386Index - 1];
      const curr = mergedK[id386Index];
      const next = mergedK[id386Index + 1];

      const isBottom = curr.lowest < prev.lowest && curr.lowest < next.lowest;
      console.log(`\nID 386 (7/21) 能否形成底分型:`);
      console.log(`  前一根: H=${prev.highest} L=${prev.lowest}`);
      console.log(`  当前:   H=${curr.highest} L=${curr.lowest}`);
      console.log(`  后一根: H=${next.highest} L=${next.lowest}`);
      console.log(`  判断: ${isBottom ? '✓ 是底分型' : '✗ 不是底分型'}`);
    }

    if (id392Index >= 1 && id392Index < mergedK.length - 1) {
      const prev = mergedK[id392Index - 1];
      const curr = mergedK[id392Index];
      const next = mergedK[id392Index + 1];

      const isTop = curr.highest > prev.highest && curr.highest > next.highest;
      console.log(`\nID 392 (7/29) 在 MergedK[${id392Index}] 能否形成顶分型:`);
      console.log(`  前一根: H=${prev.highest} L=${prev.lowest}`);
      console.log(`  当前:   H=${curr.highest} L=${curr.lowest}`);
      console.log(`  后一根: H=${next.highest} L=${next.lowest}`);
      console.log(`  判断: ${isTop ? '✓ 是顶分型' : '✗ 不是顶分型'}`);
    }

    // 获取笔数据
    const bis = biService.getBi(mergedK);

    console.log('\n=== 笔数据 (7-8月) ===');
    bis.forEach((bi: any, idx: number) => {
      const startDate = new Date(bi.startTime).toISOString().split('T')[0];
      if (startDate >= '2025-06-15' && startDate <= '2025-09-01') {
        const endDate = new Date(bi.endTime).toISOString().split('T')[0];
        console.log(`笔[${idx}]: ${startDate} -> ${endDate}`);
        if (bi.startFenxing && bi.endFenxing) {
          console.log(
            `  Start ID: ${bi.startFenxing.middleOriginId}, End ID: ${bi.endFenxing.middleOriginId}`,
          );
        }
      }
    });

    expect(true).toBe(true);
  });
});
