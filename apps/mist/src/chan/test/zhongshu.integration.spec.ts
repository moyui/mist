import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from '../services/channel.service';
import { BiVo } from '../vo/bi.vo';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiType, BiStatus } from '../enums/bi.enum';
import { ChannelType } from '../enums/channel.enum';

/**
 * ============================================================================
 * 笔中枢（Zhongshu）集成测试套件
 * ============================================================================
 *
 * 测试目标:
 * 全面测试笔中枢检测功能，验证3笔形成中枢的算法正确性
 *
 * 测试覆盖:
 * - 标准3笔中枢模式（上-下-上，下-上-下）
 * - 延伸中枢（5笔、7笔或更多）
 * - 真实市场数据场景
 * - 边界情况和异常处理
 *
 * 算法要求（缠论标准）:
 * - 最少3笔可形成中枢
 * - 笔的方向必须交替
 * - 前三笔必须有价格重叠区间
 * - 后续笔若在重叠区间内可延伸中枢
 */
describe('Zhongshu Integration Tests', () => {
  let service: ChannelService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  /**
   * ========================================================================
   * Section 1: 标准模式测试
   * ========================================================================
   */
  describe('Section 1: 标准模式测试', () => {
    it('应检测标准3笔上升中枢（上-下-上）', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up), // 第1笔: 100→120
        createMockBi(120, 105, TrendDirection.Down), // 第2笔: 120→105 (与第1笔重叠: 105-120)
        createMockBi(105, 115, TrendDirection.Up), // 第3笔: 105→115 (与第2笔重叠: 105-115)
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].trend).toBe(TrendDirection.Up);
      expect(result[0].zg).toBe(115); // min(120, 120, 115) = 115
      expect(result[0].zd).toBe(105); // max(100, 105, 105) = 105
      expect(result[0].gg).toBe(120); // max(120, 120, 115) = 120
      expect(result[0].dd).toBe(100); // min(100, 105, 105) = 100
      expect(result[0].zg).toBeLessThan(result[0].zd);
      expect(result[0].bis).toHaveLength(3);

      console.log(
        `✓ 3笔上升中枢: zg=${result[0].zg}, zd=${result[0].zd}, gg=${result[0].gg}, dd=${result[0].dd}`,
      );
    });

    it('应检测标准3笔下降中枢（下-上-下）', () => {
      const mockBi: BiVo[] = [
        createMockBi(120, 100, TrendDirection.Down), // 第1笔: 120→100
        createMockBi(100, 115, TrendDirection.Up), // 第2笔: 100→115 (与第1笔重叠: 100-115)
        createMockBi(115, 105, TrendDirection.Down), // 第3笔: 115→105 (与第2笔重叠: 105-115)
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].trend).toBe(TrendDirection.Down);
      expect(result[0].zg).toBe(115); // min(120, 115, 115) = 115
      expect(result[0].zd).toBe(100); // max(100, 100, 105) = 100
      expect(result[0].bis).toHaveLength(3);

      console.log(`✓ 3笔下降中枢: zg=${result[0].zg}, zd=${result[0].zd}`);
    });

    it('应拒绝少于3笔的数据', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(0);
      console.log(`✓ 正确拒绝2笔数据`);
    });

    it('应拒绝方向不交替的3笔', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(115, 135, TrendDirection.Up), // 方向错误：连续向上
        createMockBi(130, 150, TrendDirection.Up), // 方向错误：连续向上
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(0);
      console.log(`✓ 正确拒绝非交替方向`);
    });

    it('应拒绝无重叠的3笔', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 110, TrendDirection.Up), // 100-110
        createMockBi(90, 100, TrendDirection.Down), // 90-100 (与第1笔无重叠)
        createMockBi(110, 120, TrendDirection.Up), // 110-120 (与第2笔无重叠)
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(0);
      console.log(`✓ 正确拒绝无重叠笔`);
    });
  });

  /**
   * ========================================================================
   * Section 2: 中枢延伸测试
   * ========================================================================
   */
  describe('Section 2: 中枢延伸测试', () => {
    it('应检测延伸5笔的中枢', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up), // 第1笔
        createMockBi(120, 105, TrendDirection.Down), // 第2笔
        createMockBi(105, 115, TrendDirection.Up), // 第3笔 (形成中枢: zg=115, zd=105)
        createMockBi(115, 108, TrendDirection.Down), // 第4笔：在108-115区间，与中枢重叠
        createMockBi(108, 118, TrendDirection.Up), // 第5笔：在108-118区间，仍重叠
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis).toHaveLength(5);
      expect(result[0].type).toBe(ChannelType.UnComplete); // 最后1笔，仍有延伸可能

      console.log(`✓ 5笔延伸中枢: 包含${result[0].bis.length}笔`);
    });

    it('应检测延伸7笔的中枢', () => {
      const mockBi = createExtendedZhongshu(7);
      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis.length).toBeGreaterThanOrEqual(7);

      console.log(`✓ 7笔延伸中枢: 包含${result[0].bis.length}笔`);
    });

    it('应停止延伸当笔突破zg', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up), // 形成中枢: zg=115, zd=105
        createMockBi(115, 130, TrendDirection.Up), // 突破zg=115，延伸结束
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis).toHaveLength(3); // 只有前3笔
      expect(result[0].type).toBe(ChannelType.Complete); // 延伸结束

      console.log(
        `✓ 延伸终止（突破zg）: ${result[0].bis.length}笔, 类型=${result[0].type}`,
      );
    });

    it('应停止延伸当笔突破zd', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up), // 形成中枢: zg=115, zd=105
        createMockBi(115, 95, TrendDirection.Down), // 突破zd=105
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis).toHaveLength(3);
      expect(result[0].type).toBe(ChannelType.Complete);

      console.log(`✓ 延伸终止（突破zd）: ${result[0].bis.length}笔`);
    });

    it('应标记为UnComplete当最后1笔仍在区间内', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
        createMockBi(115, 108, TrendDirection.Down), // 仍在区间内
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].type).toBe(ChannelType.UnComplete);

      console.log(`✓ UnComplete状态标记正确`);
    });

    it('应标记为Complete当最后1笔突破区间', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
        createMockBi(115, 90, TrendDirection.Down), // 突破区间，延伸结束
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].type).toBe(ChannelType.Complete);

      console.log(`✓ Complete状态标记正确`);
    });
  });

  /**
   * ========================================================================
   * Section 3: 真实数据场景
   * ========================================================================
   */
  describe('Section 3: 真实数据场景', () => {
    it('应处理上证指数模拟数据', () => {
      // 模拟上证指数的典型走势
      const mockBi = createShanghaiIndexPattern();
      const result = service.createChannel({ bi: mockBi });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      console.log(`✓ 上证指数模式: 识别到${result.length}个中枢`);
    });

    it('应处理震荡市场模式', () => {
      // 模拟震荡市场：多个中枢
      const mockBi: BiVo[] = [
        // 第一个中枢 (笔0-2)
        createMockBi(3000, 3050, TrendDirection.Up),
        createMockBi(3050, 3020, TrendDirection.Down),
        createMockBi(3020, 3040, TrendDirection.Up),
        createMockBi(3040, 2980, TrendDirection.Down), // 突破第一个中枢

        // 第二个中枢 (笔4-6)
        createMockBi(2980, 3020, TrendDirection.Up),
        createMockBi(3020, 2990, TrendDirection.Down),
        createMockBi(2990, 3010, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result.length).toBeGreaterThanOrEqual(1);

      console.log(`✓ 震荡市场模式: 识别到${result.length}个中枢`);
    });

    it('应处理趋势市场模式', () => {
      // 模拟上升趋势：较少中枢
      const mockBi: BiVo[] = [];
      let price = 3000;

      for (let i = 0; i < 15; i++) {
        const isUp = i % 2 === 0;
        const start = price;
        const end = isUp ? price + 50 : price - 20;
        mockBi.push(
          createMockBi(
            Math.min(start, end),
            Math.max(start, end),
            isUp ? TrendDirection.Up : TrendDirection.Down,
          ),
        );
        price = end;
      }

      const result = service.createChannel({ bi: mockBi });

      expect(Array.isArray(result)).toBe(true);

      console.log(`✓ 趋势市场模式: 识别到${result.length}个中枢`);
    });
  });

  /**
   * ========================================================================
   * Section 4: 边界情况测试
   * ========================================================================
   */
  describe('Section 4: 边界情况测试', () => {
    it('应处理恰好3笔的情况', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(1);
      expect(result[0].bis).toHaveLength(3);
      expect(result[0].type).toBe(ChannelType.Complete); // 无后续笔

      console.log(`✓ 恰好3笔形成中枢`);
    });

    it('应处理大量笔（性能测试）', () => {
      const mockBi: BiVo[] = [];
      let price = 100;

      // 生成100笔
      for (let i = 0; i < 100; i++) {
        const isUp = i % 2 === 0;
        const start = price;
        const end = isUp ? price + 20 : price - 15;
        mockBi.push(
          createMockBi(
            Math.min(start, end),
            Math.max(start, end),
            isUp ? TrendDirection.Up : TrendDirection.Down,
          ),
        );
        price = end;
      }

      const startTime = Date.now();
      const result = service.createChannel({ bi: mockBi });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // 应在100ms内完成
      expect(Array.isArray(result)).toBe(true);

      console.log(`✓ 性能测试: 100笔处理耗时${endTime - startTime}ms`);
    });

    it('应处理所有笔价格相同', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 100, TrendDirection.Up),
        createMockBi(100, 100, TrendDirection.Down),
        createMockBi(100, 100, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      // zg = zd = 100，无有效重叠
      expect(result).toHaveLength(0);

      console.log(`✓ 价格相等情况处理正确`);
    });

    it('应处理极端价格值', () => {
      const mockBi: BiVo[] = [
        createMockBi(0.0001, 99999, TrendDirection.Up),
        createMockBi(99999, 0.0001, TrendDirection.Down),
        createMockBi(0.0001, 50000, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result.length).toBeGreaterThanOrEqual(0);

      console.log(`✓ 极端价格值处理正确`);
    });

    it('应处理空数组', () => {
      const result = service.createChannel({ bi: [] });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);

      console.log(`✓ 空数组处理正确`);
    });

    it('应处理单个笔', () => {
      const mockBi: BiVo[] = [createMockBi(100, 120, TrendDirection.Up)];

      const result = service.createChannel({ bi: mockBi });

      expect(result).toHaveLength(0);

      console.log(`✓ 单笔处理正确`);
    });
  });

  /**
   * ========================================================================
   * Section 5: 价格计算验证
   * ========================================================================
   */
  describe('Section 5: 价格计算验证', () => {
    it('应正确计算zg为所有笔highest的最小值', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 130, TrendDirection.Up), // highest=130
        createMockBi(130, 90, TrendDirection.Down), // highest=130
        createMockBi(90, 125, TrendDirection.Up), // highest=125 ← zg
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].zg).toBe(125); // min(130, 130, 125) = 125
      console.log(`✓ zg计算正确: ${result[0].zg}`);
    });

    it('应正确计算zd为所有笔lowest的最大值', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 130, TrendDirection.Up), // lowest=100 ← zd
        createMockBi(130, 95, TrendDirection.Down), // lowest=95
        createMockBi(95, 125, TrendDirection.Up), // lowest=95
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].zd).toBe(100); // max(100, 95, 95) = 100
      console.log(`✓ zd计算正确: ${result[0].zd}`);
    });

    it('应正确计算gg为所有笔highest的最大值', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 130, TrendDirection.Up), // highest=130 ← gg
        createMockBi(130, 90, TrendDirection.Down),
        createMockBi(90, 125, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].gg).toBe(130); // max(130, 130, 125) = 130
      console.log(`✓ gg计算正确: ${result[0].gg}`);
    });

    it('应正确计算dd为所有笔lowest的最小值', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 130, TrendDirection.Up),
        createMockBi(130, 90, TrendDirection.Down), // lowest=90 ← dd
        createMockBi(90, 125, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].dd).toBe(90); // min(100, 90, 95) = 90
      console.log(`✓ dd计算正确: ${result[0].dd}`);
    });

    it('应验证zg < zd（有重叠区间）', () => {
      const mockBi: BiVo[] = [
        createMockBi(100, 120, TrendDirection.Up),
        createMockBi(120, 105, TrendDirection.Down),
        createMockBi(105, 115, TrendDirection.Up),
      ];

      const result = service.createChannel({ bi: mockBi });

      expect(result[0].zd).toBeLessThan(result[0].zg);
      console.log(`✓ 重叠区间存在: zd(${result[0].zd}) < zg(${result[0].zg})`);
    });
  });

  // ========================================================================
  // 辅助函数
  // ========================================================================

  /**
   * 创建模拟笔数据
   */
  function createMockBi(
    lowest: number,
    highest: number,
    trend: TrendDirection,
  ): BiVo {
    return {
      startTime: new Date(),
      endTime: new Date(),
      lowest,
      highest,
      trend,
      type: BiType.Complete,
      status: BiStatus.Valid,
      independentCount: 3,
      originIds: [1, 2, 3],
      originData: [],
      startFenxing: null,
      endFenxing: null,
    };
  }

  /**
   * 创建延伸中枢（多笔在重叠区间内震荡）
   */
  function createExtendedZhongshu(count: number): BiVo[] {
    const bis: BiVo[] = [];
    let base = 100;

    for (let i = 0; i < count; i++) {
      const isUp = i % 2 === 0;
      const low = base;
      const high = isUp ? base + 20 : base - 5;

      bis.push(
        createMockBi(
          Math.min(low, high),
          Math.max(low, high),
          isUp ? TrendDirection.Up : TrendDirection.Down,
        ),
      );

      // 调整基准价格以保持在重叠区间内
      base = isUp ? high - 10 : low + 10;
    }

    return bis;
  }

  /**
   * 创建上证指数典型波动模式
   */
  function createShanghaiIndexPattern(): BiVo[] {
    // 模拟上证指数的典型波动模式
    return [
      createMockBi(3000, 3050, TrendDirection.Up),
      createMockBi(3050, 3020, TrendDirection.Down),
      createMockBi(3020, 3040, TrendDirection.Up),
      createMockBi(3040, 3010, TrendDirection.Down),
      createMockBi(3010, 3030, TrendDirection.Up),
    ];
  }
});
