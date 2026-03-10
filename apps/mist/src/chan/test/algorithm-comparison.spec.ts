import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { UtilsService } from '@app/utils';
import { shanghaiIndexData2024_2025 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024-2025.fixture';
import { MergedKVo } from '../vo/merged-k.vo';

/**
 * Algorithm Comparison Test
 * Compares the old and new Bi identification algorithms
 */
describe('Algorithm Comparison: Old vs New', () => {
  let biService: BiService;
  let kMergeService: KMergeService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService, UtilsService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should compare old and new algorithms', () => {
    const mergedK: MergedKVo[] = kMergeService.merge(
      shanghaiIndexData2024_2025,
    );

    // Test new algorithm
    const bisNew = biService.getBi(mergedK);

    // Test old algorithm
    const bisOld = biService.getBiOld(mergedK);

    console.log('\n=== Algorithm Comparison Results ===');
    console.log(`Old algorithm: ${bisOld.length} bis`);
    console.log(`New algorithm: ${bisNew.length} bis`);
    console.log(`Difference: ${bisNew.length - bisOld.length} bis`);

    const upOld = bisOld.filter((b) => b.trend === 'up').length;
    const downOld = bisOld.filter((b) => b.trend === 'down').length;
    const upNew = bisNew.filter((b) => b.trend === 'up').length;
    const downNew = bisNew.filter((b) => b.trend === 'down').length;

    console.log(`\nOld algorithm: up=${upOld}, down=${downOld}`);
    console.log(`New algorithm: up=${upNew}, down=${downNew}`);

    // Check alternation
    const oldAlternating = bisOld.every((bi, i) => {
      if (i === 0) return true;
      return bi.trend !== bisOld[i - 1].trend;
    });
    const newAlternating = bisNew.every((bi, i) => {
      if (i === 0) return true;
      return bi.trend !== bisNew[i - 1].trend;
    });

    console.log(`\nOld algorithm alternating: ${oldAlternating}`);
    console.log(`New algorithm alternating: ${newAlternating}`);

    // The new algorithm should produce alternating trends (fundamental Chan Theory property)
    expect(newAlternating).toBe(true);

    // The old algorithm has a known bug where it doesn't always alternate
    // This test documents that behavior
    if (!oldAlternating) {
      console.log('⚠️  Old algorithm has non-alternating trends (known issue)');
    }

    // Both should identify reasonable number of bis
    expect(bisOld.length).toBeGreaterThan(0);
    expect(bisNew.length).toBeGreaterThan(0);

    console.log('\n=====================================\n');
  });
});
