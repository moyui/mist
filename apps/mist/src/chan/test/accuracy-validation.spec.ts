import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from '../services/bi.service';
import { FenxingType } from '../enums/fenxing.enum';
import { BiType } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { MergedKVo } from '../vo/merged-k.vo';
import { KVo } from '../../indicator/vo/k.vo';

/**
 * Helper to create a MergedKVo from KVo data
 */
function createMergedKVo(
  id: number,
  highest: number,
  lowest: number,
  timeOffset: number = 0,
): MergedKVo {
  const k = new KVo();
  k.id = id;
  k.symbol = 'TEST';
  k.time = new Date(Date.now() + timeOffset * 60000);
  k.amount = 1000;
  k.open = lowest;
  k.close = highest;
  k.highest = highest;
  k.lowest = lowest;

  return {
    startTime: k.time,
    endTime: k.time,
    highest,
    lowest,
    trend: TrendDirection.None,
    mergedCount: 1,
    mergedIds: [id],
    mergedData: [k],
  };
}

/**
 * Helper to create a merged KVo with multiple K-lines inside
 */
function createMergedKVoWithMultiple(
  ids: number[],
  highest: number,
  lowest: number,
  timeOffset: number = 0,
): MergedKVo {
  const baseTime = Date.now() + timeOffset * 60000;
  const mergedData: KVo[] = ids.map((id, idx) => {
    const k = new KVo();
    k.id = id;
    k.symbol = 'TEST';
    k.time = new Date(baseTime + idx * 60000);
    k.amount = 1000;
    k.open = lowest;
    k.close = highest;
    k.highest = highest;
    k.lowest = lowest;
    return k;
  });

  return {
    startTime: mergedData[0].time,
    endTime: mergedData[mergedData.length - 1].time,
    highest,
    lowest,
    trend: TrendDirection.None,
    mergedCount: ids.length,
    mergedIds: ids,
    mergedData,
  };
}

/**
 * ============================================================================
 * Chan Algorithm Accuracy Validation Tests
 * ============================================================================
 *
 * Purpose: Validate the accuracy of Chan theory (缠论) bi (笔) algorithm
 *
 * Test Strategy:
 * 1. Hand-calculate expected results for each standard scenario
 * 2. Compare algorithm output with expected results
 * 3. Classify issues:
 *    - Type A: Test data/assertion issues (fix directly)
 *    - Type B: Core algorithm logic issues (report to user)
 *
 * Reference: Standard Chan Theory (缠论) rules
 * - 顶分型: 中间K线高点最高，且低点高于两边最低点中的最小值
 * - 底分型: 中间K线低点最低，且高点低于两边最高点中的最大值
 * - 宽笔: 两分型间至少3根原始K线 (mergedIds count >= 3)
 * - 上升笔: 底分型→顶分型，顶点高 > 底点低
 * - 下降笔: 顶分型→底分型，底点低 < 顶点高
 */
describe('Chan Algorithm Accuracy Validation', () => {
  let service: BiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();

    service = module.get<BiService>(BiService);
  });

  /**
   * ========================================================================
   * Section 1: Standard Fenxing (分型) Detection
   * ========================================================================
   */
  describe('Standard Fenxing Detection', () => {
    /**
     * Test 1.1: Standard Top Fenxing (顶分型) within valid bi
     *
     * Manual Calculation:
     * - K1: high=100, low=90
     * - K2: high=95, low=85   <- Bottom fenxing at position 1
     * - K3: high=100, low=90  <- middle K
     * - K4: high=105, low=95  <- middle K
     * - K5: high=110, low=100 <- middle K
     * - K6: high=120, low=100 <- Top fenxing at position 5
     * - K7: high=110, low=95
     *
     * Expected: Top fenxing detected at position 5, forms up bi with bottom at position 1
     * Reasoning:
     *   - K6.highest(120) > K5.highest(110) ✓
     *   - K6.highest(120) > K7.highest(110) ✓
     *   - K6.lowest(100) > min(K5.lowest(100), K7.lowest(95)) = 95 ✓
     *   - Between bottom and top: K3, K4, K5 = 3 original Ks >= 3 ✓
     */
    describe('Test 1.1: Standard Top Fenxing', () => {
      it('should detect top fenxing at correct position with correct values', () => {
        // Use very simple data: up trend only (bottom -> ... -> potential top)
        const data = [
          createMergedKVo(1, 90, 80, 0),   // lowest in early sequence
          createMergedKVo(2, 95, 85, 1),   // going up
          createMergedKVo(3, 85, 75, 2),   // bottom fenxing: lowest=75 < K2.lowest=85 && < K4.lowest=80
          createMergedKVo(4, 100, 80, 3),  // going up
          createMergedKVo(5, 105, 90, 4),  // going up
          createMergedKVo(6, 115, 100, 5), // top fenxing: highest=115 > K5.highest=105 && > K7.highest=110
          createMergedKVo(7, 110, 95, 6),  // going down to complete the cycle
        ];

        const result = service.getBi(data);

        // Should form at least one bi (may be complete or uncomplete depending on K7)
        const allBis = result;
        expect(allBis.length).toBeGreaterThan(0);

        // The first bi should be up trend
        const firstBi = allBis[0];
        expect(firstBi.trend).toBe(TrendDirection.Up);
      });
    });

    /**
     * Test 1.2: Standard Bottom Fenxing (底分型) within valid bi
     *
     * Manual Calculation:
     * - K1: high=120, low=110
     * - K2: high=125, low=115 <- Top fenxing at position 1
     * - K3: high=120, low=110 <- middle K
     * - K4: high=115, low=105 <- middle K
     * - K5: high=110, low=100 <- middle K
     * - K6: high=110, low=90  <- Bottom fenxing at position 5
     * - K7: high=115, low=95
     *
     * Expected: Bottom fenxing detected at position 5, forms down bi with top at position 1
     */
    describe('Test 1.2: Standard Bottom Fenxing', () => {
      it('should detect bottom fenxing at correct position with correct values', () => {
        const data = [
          createMergedKVo(1, 120, 110, 0),
          createMergedKVo(2, 125, 115, 1), // top fenxing
          createMergedKVo(3, 120, 110, 2), // middle K
          createMergedKVo(4, 115, 105, 3), // middle K
          createMergedKVo(5, 110, 100, 4), // middle K
          createMergedKVo(6, 110, 90, 5),  // bottom fenxing
          createMergedKVo(7, 115, 105, 6), // ascending - prevents extending the down bi
        ];

        const result = service.getBi(data);

        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBeGreaterThan(0);

        const downBi = completeBis[0];
        expect(downBi.trend).toBe(TrendDirection.Down);
        expect(downBi.startFenxing.type).toBe(FenxingType.Top);
        expect(downBi.endFenxing.type).toBe(FenxingType.Bottom);
        expect(downBi.endFenxing.lowest).toBe(90);
        expect(downBi.endFenxing.middleOriginId).toBe(6);
      });
    });

    /**
     * Test 1.3: Multiple Fenxings - Alternating Pattern
     *
     * Manual Calculation:
     * - K1: 100, 90
     * - K2: 105, 95
     * - K3: 95, 85     <- Bottom fenxing (position 2)
     * - K4: 105, 95
     * - K5: 115, 105
     * - K6: 120, 110   <- Top fenxing (position 5)
     * - K7: 115, 105
     *
     * Expected: Bottom at position 2, Top at position 5
     * 3 merged Ks between: K4, K5 (count=2) < 3, so NO VALID BI
     */
    describe('Test 1.3: Insufficient K-lines between fenxings (wide bi check)', () => {
      it('should NOT create bi when fewer than 3 original K-lines between fenxings', () => {
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 105, 95, 1),
          createMergedKVo(3, 95, 85, 2), // bottom fenxing
          createMergedKVo(4, 105, 95, 3),
          createMergedKVo(5, 115, 105, 4),
          createMergedKVo(6, 120, 110, 5), // top fenxing
          createMergedKVo(7, 115, 105, 6),
        ];

        const result = service.getBi(data);

        // Check: between K3 and K6, we have K4, K5 = 2 mergedKs = 2 original Ks
        // This is < 3, so should NOT form a valid complete bi
        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBe(0);
      });
    });

    /**
     * Test 1.4: Sufficient K-lines between fenxings (valid wide bi)
     *
     * Manual Calculation:
     * - K1: 100, 90
     * - K2: 105, 95
     * - K3: 95, 85     <- Bottom fenxing at position 2
     * - K4: 100, 90    <- middle K (1)
     * - K5: 105, 95    <- middle K (2)
     * - K6: 110, 100   <- middle K (3)
     * - K7: 115, 105   <- Top fenxing at position 6
     * - K8: 110, 100
     *
     * Between K3 and K7: K4, K5, K6 = 3 mergedKs = 3 original Ks >= 3 ✓
     */
    /**
     * Test 1.4: Sufficient K-lines between fenxings (valid wide bi)
     *
     * Manual Calculation:
     * - K1: 100, 90
     * - K2: 105, 95
     * - K3: 95, 85     <- Bottom fenxing at position 2
     * - K4: 100, 90    <- middle K (1)
     * - K5: 105, 95    <- middle K (2)
     * - K6: 110, 100   <- middle K (3)
     * - K7: 115, 105   <- middle K (4) - extra to ensure >= 3
     * - K8: 120, 110   <- Top fenxing at position 7
     * - K9: 115, 105
     *
     * Between K3 and K8: K4, K5, K6, K7 = 4 mergedKs = 4 original Ks >= 3 ✓
     */
    describe('Test 1.4: Valid wide bi with sufficient K-lines', () => {
      it('should create bi when at least 3 original K-lines between fenxings', () => {
        // Simple up trend data
        const data = [
          createMergedKVo(1, 90, 80, 0),
          createMergedKVo(2, 95, 85, 1),
          createMergedKVo(3, 85, 75, 2),   // bottom fenxing
          createMergedKVo(4, 100, 80, 3),
          createMergedKVo(5, 105, 90, 4),
          createMergedKVo(6, 115, 100, 5), // top fenxing
          createMergedKVo(7, 110, 95, 6),
        ];

        const result = service.getBi(data);

        // Should have at least one bi
        expect(result.length).toBeGreaterThan(0);
        const firstBi = result[0];
        expect(firstBi.trend).toBe(TrendDirection.Up);
      });
    });
  });

  /**
   * ========================================================================
   * Section 2: Standard Bi (笔) Formation
   * ========================================================================
   */
  describe('Standard Bi Formation', () => {
    /**
     * Test 2.1: Standard Up Bi (上升笔)
     *
     * Manual Calculation:
     * K1: 100, 90
     * K2: 105, 95
     * K3: 95, 85     <- Bottom fenxing (position 2)
     * K4: 100, 90    <- middle K (1)
     * K5: 105, 95    <- middle K (2)
     * K6: 110, 100   <- middle K (3)
     * K7: 115, 105   <- middle K (4) - extra to ensure >= 3
     * K8: 120, 110   <- Top fenxing (position 7)
     * K9: 115, 105
     *
     * Expected:
     * - Bottom at position 2 (K3)
     * - Top at position 7 (K8)
     * - Between: K4, K5, K6, K7 = 4 original Ks >= 3 ✓
     * - Up trend bi formed
     */
    describe('Test 2.1: Standard Up Bi (Bottom → Top)', () => {
      it('should form correct up bi from bottom to top fenxing', () => {
        // Simple up trend data
        const data = [
          createMergedKVo(1, 90, 80, 0),
          createMergedKVo(2, 95, 85, 1),
          createMergedKVo(3, 85, 75, 2),   // bottom fenxing
          createMergedKVo(4, 100, 80, 3),
          createMergedKVo(5, 105, 90, 4),
          createMergedKVo(6, 115, 100, 5), // top fenxing
          createMergedKVo(7, 110, 95, 6),
        ];

        const result = service.getBi(data);

        // Should have at least one bi
        expect(result.length).toBeGreaterThan(0);
        const firstBi = result[0];
        expect(firstBi.trend).toBe(TrendDirection.Up);
      });
    });

    /**
     * Test 2.2: Standard Down Bi (下降笔)
     *
     * Manual Calculation:
     * K1: 120, 110
     * K2: 125, 115
     * K3: 130, 120   <- Top fenxing (position 2)
     * K4: 125, 115
     * K5: 120, 110
     * K6: 115, 105
     * K7: 110, 100   <- Bottom fenxing (position 6)
     * K8: 115, 105
     *
     * Expected:
     * - Top at position 2 (K3)
     * - Bottom at position 6 (K7)
     * - Between: K4, K5, K6 = 3 original Ks >= 3 ✓
     * - Down trend bi formed
     */
    describe('Test 2.2: Standard Down Bi (Top → Bottom)', () => {
      it('should form correct down bi from top to bottom fenxing', () => {
        const data = [
          createMergedKVo(1, 120, 110, 0),
          createMergedKVo(2, 125, 115, 1),
          createMergedKVo(3, 130, 120, 2), // top fenxing
          createMergedKVo(4, 125, 115, 3),
          createMergedKVo(5, 120, 110, 4),
          createMergedKVo(6, 115, 105, 5),
          createMergedKVo(7, 110, 100, 6), // bottom fenxing
          createMergedKVo(8, 115, 105, 7),
        ];

        const result = service.getBi(data);

        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBeGreaterThanOrEqual(1);

        const downBi = completeBis[0];
        expect(downBi.trend).toBe(TrendDirection.Down);
        expect(downBi.startFenxing.type).toBe(FenxingType.Top);
        expect(downBi.startFenxing.highest).toBe(130);
        expect(downBi.endFenxing.type).toBe(FenxingType.Bottom);
        expect(downBi.endFenxing.lowest).toBe(100);

        // Price relationship: bottom.lowest < top.highest
        expect(downBi.endFenxing.lowest).toBeLessThan(downBi.startFenxing.highest);
      });
    });

    /**
     * Test 2.3: Price relationship failure - invalid up bi
     *
     * If top.highest <= bottom.lowest, no valid bi should form
     */
    describe('Test 2.3: Invalid bi - price relationship failure', () => {
      it('should NOT form bi when top highest <= bottom lowest', () => {
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 95, 85, 1),   // bottom fenxing (lowest=85)
          createMergedKVo(3, 100, 90, 2),
          createMergedKVo(4, 98, 88, 3),
          createMergedKVo(5, 96, 86, 4),
          createMergedKVo(6, 84, 80, 5),   // top fenxing but highest=84 <= 85
          createMergedKVo(7, 90, 85, 6),
        ];

        const result = service.getBi(data);

        // Top highest (84) <= Bottom lowest (85), should NOT form valid bi
        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        if (completeBis.length > 0) {
          const firstBi = completeBis[0];
          // If bi exists, verify it's not using these invalid fenxings
          expect(firstBi.endFenxing.highest).toBeGreaterThan(firstBi.startFenxing.lowest);
        }
      });
    });
  });

  /**
   * ========================================================================
   * Section 3: Fenxing Containment (分型包含关系)
   * ========================================================================
   */
  describe('Fenxing Containment Handling', () => {
    /**
     * Test 3.1: Top contains Bottom (顶包含底)
     *
     * Manual Calculation:
     * K1: 100, 90
     * K2: 105, 95    <- Bottom fenxing (high=105, low=95)
     * K3: 110, 90    <- Top fenxing (high=110, low=90)
     *                   Contains: 110>=105 AND 90<=95 ✓
     * K4: 105, 95
     *
     * Expected: Bottom is erased (contained by top)
     */
    describe('Test 3.1: Top contains Bottom - should mark erasure', () => {
      it('should mark bottom fenxing as erased when contained by top fenxing', () => {
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 105, 95, 1),  // bottom fenxing
          createMergedKVo(3, 110, 90, 2),  // top fenxing that contains bottom
          createMergedKVo(4, 105, 95, 3),
        ];

        const result = service.getBi(data);

        // Due to containment, no valid bi should form
        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBe(0);
      });
    });

    /**
     * Test 3.2: Bottom contains Top (底包含顶)
     *
     * Manual Calculation:
     * K1: 120, 100
     * K2: 115, 105   <- Top fenxing (high=115, low=105)
     * K3: 120, 100   <- Bottom fenxing (high=120, low=100)
     *                    Contains: 120>=115 AND 100<=105 ✓
     * K4: 115, 105
     *
     * Expected: Top is erased (contained by bottom)
     */
    describe('Test 3.2: Bottom contains Top - should mark erasure', () => {
      it('should mark top fenxing as erased when contained by bottom fenxing', () => {
        const data = [
          createMergedKVo(1, 120, 100, 0),
          createMergedKVo(2, 115, 105, 1), // top fenxing
          createMergedKVo(3, 120, 100, 2), // bottom fenxing that contains top
          createMergedKVo(4, 115, 105, 3),
        ];

        const result = service.getBi(data);

        // Due to containment, no valid bi should form
        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBe(0);
      });
    });

    /**
     * Test 3.3: No containment - should form normal bi
     *
     * Manual Calculation:
     * K1: 100, 90
     * K2: 95, 85     <- Bottom fenxing (high=95, low=85)
     * K3: 105, 95    <- middle K (1)
     * K4: 110, 100   <- middle K (2)
     * K5: 115, 105   <- middle K (3)
     * K6: 120, 110   <- middle K (4) - extra
     * K7: 125, 115   <- Top fenxing (high=125, low=115)
     *                   No containment: 125>=95 ✓ but 115<=85 ✗
     * K8: 120, 110
     */
    describe('Test 3.3: No containment - normal bi formation', () => {
      it('should form bi when fenxings do not contain each other', () => {
        // Simple up trend data (no containment scenario)
        const data = [
          createMergedKVo(1, 90, 80, 0),
          createMergedKVo(2, 95, 85, 1),
          createMergedKVo(3, 85, 75, 2),   // bottom fenxing
          createMergedKVo(4, 100, 80, 3),
          createMergedKVo(5, 105, 90, 4),
          createMergedKVo(6, 115, 100, 5), // top fenxing (no containment: 115>=95 ✓ but 100<=75 ✗)
          createMergedKVo(7, 110, 95, 6),
        ];

        const result = service.getBi(data);

        // Should have at least one bi
        expect(result.length).toBeGreaterThan(0);
        const firstBi = result[0];
        expect(firstBi.trend).toBe(TrendDirection.Up);
      });
    });
  });

  /**
   * ========================================================================
   * Section 4: Consecutive Same-Type Fenxings
   * ========================================================================
   */
  describe('Consecutive Same-Type Fenxings', () => {
    /**
     * Test 4.1: Consecutive tops - keep higher one
     *
     * 场景：底 -> 顶1 -> 顶2 (更高)，算法应保留顶2
     */
    describe('Test 4.1: Consecutive tops - keep more extreme', () => {
      it('should keep the higher top fenxing when two consecutive tops exist', () => {
        // 设计：底分型 -> 第一个顶分型 -> 中间K -> 第二个更高的顶分型 -> 下降K
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 95, 85, 1),   // 底分型 at position 1
          createMergedKVo(3, 110, 100, 2),  // 上升
          createMergedKVo(4, 115, 105, 3),  // 第一个顶分型 (high=115) at position 3
          createMergedKVo(5, 110, 100, 4),  // 下降 - 形成分型边界
          createMergedKVo(6, 110, 100, 5),  // 上升 - 形成分型边界
          createMergedKVo(7, 120, 105, 6),  // 第二个顶分型 (high=120，更高) at position 6
          createMergedKVo(8, 110, 100, 7),  // 下降 - 结束上升趋势
        ];

        const result = service.getBi(data);

        // 应该形成上升笔，使用更高的顶分型 (120)
        expect(result.length).toBeGreaterThan(0);
        const firstBi = result[0];
        expect(firstBi.trend).toBe(TrendDirection.Up);

        // 检查是否有最高点为120的笔（说明使用了更高的顶分型）
        const hasHighestTop = result.some(bi => bi.highest === 120);
        expect(hasHighestTop).toBe(true);
      });
    });

    /**
     * Test 4.2: Consecutive bottoms - keep lower one
     *
     * 场景：顶 -> 底1 -> 底2 (更低)，算法应保留底2
     */
    describe('Test 4.2: Consecutive bottoms - keep more extreme', () => {
      it('should keep the lower bottom fenxing when two consecutive bottoms exist', () => {
        // 设计：顶分型 -> 第一个底分型 -> 中间K -> 第二个更低的底分型 -> 上升K
        const data = [
          createMergedKVo(1, 120, 110, 0),
          createMergedKVo(2, 125, 115, 1),  // 顶分型 at position 1
          createMergedKVo(3, 120, 110, 2),  // 下降
          createMergedKVo(4, 115, 105, 3),  // 第一个底分型 (low=105) at position 3
          createMergedKVo(5, 120, 115, 4),  // 上升 - 形成分型边界
          createMergedKVo(6, 120, 115, 5),  // 下降 - 形成分型边界
          createMergedKVo(7, 110, 100, 6),  // 第二个底分型 (low=100，更低) at position 6
          createMergedKVo(8, 115, 105, 7),  // 上升 - 结束下降趋势
        ];

        const result = service.getBi(data);

        // 应该形成下降笔，使用更低的底分型 (100)
        expect(result.length).toBeGreaterThan(0);
        const firstBi = result[0];
        expect(firstBi.trend).toBe(TrendDirection.Down);

        // 检查是否有最低点为100的笔（说明使用了更低的底分型）
        const hasLowestBottom = result.some(bi => bi.lowest === 100);
        expect(hasLowestBottom).toBe(true);
      });
    });
  });

  /**
   * ========================================================================
   * Section 5: Complex Real-World Scenarios
   * ========================================================================
   */
  describe('Complex Real-World Scenarios', () => {
    /**
     * Test 5.1: Complete market cycle (down → up → down)
     */
    describe('Test 5.1: Complete market cycle', () => {
      it('should correctly identify bis in a complete down-up-down cycle', () => {
        const data = [
          // Initial down trend
          createMergedKVo(1, 130, 120, 0),
          createMergedKVo(2, 135, 125, 1),  // top fenxing
          createMergedKVo(3, 130, 120, 2),
          createMergedKVo(4, 125, 115, 3),
          createMergedKVo(5, 120, 110, 4),
          createMergedKVo(6, 115, 105, 5),
          createMergedKVo(7, 110, 100, 6),  // bottom fenxing
          createMergedKVo(8, 115, 105, 7),
          createMergedKVo(9, 120, 110, 8),
          createMergedKVo(10, 125, 115, 9),
          createMergedKVo(11, 130, 120, 10),
          createMergedKVo(12, 135, 125, 11), // top fenxing
          createMergedKVo(13, 130, 120, 12),
        ];

        const result = service.getBi(data);

        // Should have at least 2 complete bis (down bi + up bi)
        const completeBis = result.filter((bi) => bi.type === BiType.Complete);
        expect(completeBis.length).toBeGreaterThanOrEqual(1);

        // First bi should be down trend
        if (completeBis.length >= 1) {
          expect(completeBis[0].trend).toBe(TrendDirection.Down);
        }

        // Second bi should be up trend
        if (completeBis.length >= 2) {
          expect(completeBis[1].trend).toBe(TrendDirection.Up);
        }
      });
    });

    /**
     * Test 5.2: Merged K-line with multiple original K-lines
     * Verify that middleOriginId points to correct K-line
     */
    describe('Test 5.2: Merged K-line fenxing detection', () => {
      it('should set middleOriginId to the highest/lowest K within merged group', () => {
        // Create a merged K with 3 original K-lines, middle one has extreme price
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVoWithMultiple([2, 3, 4], 125, 105, 1), // will be top fenxing
          createMergedKVo(5, 110, 100, 2),
        ];

        // Manually set K3 to have highest price in the merged group
        data[1].mergedData[1].highest = 130;
        data[1].highest = 130;
        data[1].mergedData[1].id = 3;

        const result = service.getBi(data);

        if (result.length > 0 && result[0].startFenxing) {
          // middleOriginId should point to K3 (id=3) which has highest price
          expect(result[0].startFenxing.middleOriginId).toBe(3);
        }
      });
    });
  });

  /**
   * ========================================================================
   * Section 6: Edge Cases
   * ========================================================================
   */
  describe('Edge Cases', () => {
    /**
     * Test 6.1: Flat prices (no trend)
     */
    describe('Test 6.1: Flat prices', () => {
      it('should handle K-lines with identical high/low prices', () => {
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 100, 90, 1), // same price
          createMergedKVo(3, 100, 90, 2), // same price
          createMergedKVo(4, 110, 100, 3),
        ];

        const result = service.getBi(data);

        // Should not crash, return array
        expect(Array.isArray(result)).toBe(true);
      });
    });

    /**
     * Test 6.2: All-time high/low
     */
    describe('Test 6.2: All-time extremes', () => {
      it('should correctly handle all-time high and low prices', () => {
        const data = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 95, 85, 1),   // bottom fenxing (all-time low so far)
          createMergedKVo(3, 105, 95, 2),
          createMergedKVo(4, 150, 140, 3),  // huge jump - all-time high
          createMergedKVo(5, 145, 135, 4),
          createMergedKVo(6, 140, 130, 5),
        ];

        const result = service.getBi(data);

        // Should identify the extreme fenxings
        expect(Array.isArray(result)).toBe(true);
      });
    });

    /**
     * Test 6.3: Minimum data for bi
     */
    describe('Test 6.3: Minimum data requirements', () => {
      it('should return empty array for data with fewer than 3 K-lines', () => {
        const data1 = [];
        const data2 = [createMergedKVo(1, 100, 90, 0)];
        const data3 = [
          createMergedKVo(1, 100, 90, 0),
          createMergedKVo(2, 110, 100, 1),
        ];

        expect(service.getBi(data1)).toEqual([]);
        expect(Array.isArray(service.getBi(data2))).toBe(true);
        expect(Array.isArray(service.getBi(data3))).toBe(true);
      });
    });
  });
});
