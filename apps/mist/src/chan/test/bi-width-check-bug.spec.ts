import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { KMergeService } from '../services/k-merge.service';
import { TrendService } from '../../trend/trend.service';
import { shanghaiIndexData2024 } from '../../../../../test-data/fixtures/k-line/shanghai-index-2024.fixture';
import { TrendDirection } from '../enums/trend-direction.enum';

/**
 * Bug修复测试：宽笔检查应该基于原始K线数量，而不是合并K线索引
 *
 * 问题描述：
 * 当K线合并后（如6月25-27日被合并），宽笔检查使用合并K线索引来计算原始K线数量，
 * 导致计算结果不正确。
 *
 * 期望行为：
 * 6月28日-7月2日应该能形成一个有效的上升笔，包含足够数量的原始K线。
 */
describe('Bi Width Check Bug Fix Test', () => {
  let kMergeService: KMergeService;
  let biService: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService, KMergeService, TrendService],
    }).compile();

    biService = module.get<BiService>(BiService);
    kMergeService = module.get<KMergeService>(KMergeService);
  });

  it('should identify bi from 2024-06-28 to 2024-07-02 after K-line merging', () => {
    // 步骤1: 进行K线合并（模拟后端API的流程）
    const mergedK = kMergeService.merge(shanghaiIndexData2024);

    console.log(`\n=== 测试条件 ===`);
    console.log(`原始K线数: ${shanghaiIndexData2024.length}`);
    console.log(`合并后K线数: ${mergedK.length}`);

    // 找到6月25-27日的合并K线
    const mergedJune25to27 = mergedK.find((mk) => {
      const start = new Date(mk.startTime);
      const end = new Date(mk.endTime);
      return (
        start.toISOString().split('T')[0] === '2024-06-25' &&
        end.toISOString().split('T')[0] === '2024-06-27'
      );
    });

    if (mergedJune25to27) {
      console.log(
        `\n6月25-27日被合并成1根合并K线，包含 ${mergedJune25to27.mergedCount} 根原始K线`,
      );
      console.log(`原始K线ID: ${JSON.stringify(mergedJune25to27.mergedIds)}`);
    }

    // 步骤2: 基于合并K线识别笔
    const biData = biService.getBi(mergedK);

    console.log(`\n识别到的笔数量: ${biData.length}`);

    // 步骤3: 查找6月28日-7月2日之间的笔
    const targetBi = biData.find((bi) => {
      const start =
        bi.startTime instanceof Date ? bi.startTime : new Date(bi.startTime);
      const end =
        bi.endTime instanceof Date ? bi.endTime : new Date(bi.endTime);
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      return startStr === '2024-06-28' && endStr === '2024-07-02';
    });

    console.log(`\n=== 测试结果 ===`);

    if (targetBi) {
      console.log(`✅ 成功识别到6月28日-7月2日的上升笔`);
      console.log(`   趋势: ${targetBi.trend}`);
      console.log(`   包含原始K线数: ${targetBi.originIds.length}`);
      console.log(`   类型: ${targetBi.type}`);
    } else {
      console.log(`❌ 未识别到6月28日-7月2日的笔`);

      // 显示该时间段识别到的笔
      const nearbyBis = biData.filter((bi) => {
        const start =
          bi.startTime instanceof Date ? bi.startTime : new Date(bi.startTime);
        const end =
          bi.endTime instanceof Date ? bi.endTime : new Date(bi.endTime);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        return (
          (startStr >= '2024-06-20' && startStr <= '2024-07-10') ||
          (endStr >= '2024-06-20' && endStr <= '2024-07-10')
        );
      });

      console.log(`\n该时间段识别到的笔:`);
      nearbyBis.forEach((bi, idx) => {
        const start =
          bi.startTime instanceof Date ? bi.startTime : new Date(bi.startTime);
        const end =
          bi.endTime instanceof Date ? bi.endTime : new Date(bi.endTime);
        console.log(
          `笔${idx + 1}: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]} (${bi.trend})`,
        );
      });
    }

    // 断言：应该能识别到6月28日-7月2日的上升笔
    expect(targetBi).toBeDefined();
    expect(targetBi?.trend).toBe(TrendDirection.Up);
    expect(targetBi?.originIds.length).toBeGreaterThanOrEqual(3);
  });

  it('should correctly count origin K-lines between fenxings', () => {
    // 直接测试分型识别和宽笔检查
    const mergedK = kMergeService.merge(shanghaiIndexData2024);
    const fenxings = biService.getFenxings(mergedK);

    // 找到6月28日和7月2日附近的分型
    const june28Fenxing = fenxings.find((f) => {
      const idx = f.middleIndex;
      const mk = mergedK[idx];
      if (!mk) return false;
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      return date === '2024-06-28';
    });

    const july02Fenxing = fenxings.find((f) => {
      const idx = f.middleIndex;
      const mk = mergedK[idx];
      if (!mk) return false;
      const date = new Date(mk.endTime).toISOString().split('T')[0];
      return date === '2024-07-02';
    });

    console.log(`\n=== 分型检查 ===`);
    if (june28Fenxing) {
      console.log(
        `6月28日分型: ${june28Fenxing.type}, 原始ID: ${june28Fenxing.middleOriginId}`,
      );
    }
    if (july02Fenxing) {
      console.log(
        `7月2日分型: ${july02Fenxing.type}, 原始ID: ${july02Fenxing.middleOriginId}`,
      );
    }

    // 如果两个分型都存在，检查它们之间的原始K线数量
    if (june28Fenxing && july02Fenxing) {
      const startId = june28Fenxing.middleOriginId;
      const endId = july02Fenxing.middleOriginId;

      // 计算之间的原始K线数量
      let count = 0;
      for (const mk of mergedK) {
        for (const id of mk.mergedIds) {
          if (id > startId && id < endId) {
            count++;
          }
        }
      }

      console.log(`分型之间的原始K线数量: ${count}`);
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });
});
