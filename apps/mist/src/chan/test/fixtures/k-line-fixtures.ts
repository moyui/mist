import { KVo } from '../../../indicator/vo/k.vo';

/**
 * Test fixtures for K-line data
 */
export class KLineFixtures {
  /**
   * Helper to create a KVo with minimal required fields
   */
  public static createKVo(
    id: number,
    highest: number,
    lowest: number,
    timeOffset: number = 0,
  ): KVo {
    const k = new KVo();
    k.id = id;
    k.symbol = 'TEST';
    k.time = new Date(Date.now() + timeOffset * 60000); // minutes offset
    k.amount = 1000;
    k.open = lowest;
    k.close = highest;
    k.highest = highest;
    k.lowest = lowest;
    return k;
  }

  /**
   * Simple upward trend K-lines
   * Each K-line has higher high and higher low than the previous
   */
  static upTrend(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 110, 100, 1),
      this.createKVo(3, 120, 110, 2),
      this.createKVo(4, 130, 120, 3),
      this.createKVo(5, 140, 130, 4),
    ];
  }

  /**
   * Simple downward trend K-lines
   * Each K-line has lower high and lower low than the previous
   */
  static downTrend(): KVo[] {
    return [
      this.createKVo(1, 140, 130, 0),
      this.createKVo(2, 130, 120, 1),
      this.createKVo(3, 120, 110, 2),
      this.createKVo(4, 110, 100, 3),
      this.createKVo(5, 100, 90, 4),
    ];
  }

  /**
   * K-lines with containment relationship
   * K-line 2 is contained within K-line 1 (up trend)
   */
  static withContainmentUpTrend(): KVo[] {
    return [
      this.createKVo(1, 120, 100, 0),
      this.createKVo(2, 115, 105, 1), // contained within K1
      this.createKVo(3, 130, 120, 2),
      this.createKVo(4, 140, 130, 3),
    ];
  }

  /**
   * K-lines with containment relationship
   * K-line 2 is contained within K-line 1 (down trend)
   */
  static withContainmentDownTrend(): KVo[] {
    return [
      this.createKVo(1, 140, 120, 0),
      this.createKVo(2, 135, 125, 1), // contained within K1
      this.createKVo(3, 120, 100, 2),
      this.createKVo(4, 110, 90, 3),
    ];
  }

  /**
   * Standard top fenxing (顶分型)
   * prev < now > next (middle has highest high)
   */
  static topFenxing(): {
    prev: KVo;
    now: KVo;
    next: KVo;
  } {
    return {
      prev: this.createKVo(1, 100, 90, 0),
      now: this.createKVo(2, 120, 100, 1), // highest
      next: this.createKVo(3, 110, 95, 2),
    };
  }

  /**
   * Standard bottom fenxing (底分型)
   * prev > now < next (middle has lowest low)
   */
  static bottomFenxing(): {
    prev: KVo;
    now: KVo;
    next: KVo;
  } {
    return {
      prev: this.createKVo(1, 120, 100, 0),
      now: this.createKVo(2, 110, 90, 1), // lowest
      next: this.createKVo(3, 115, 95, 2),
    };
  }

  /**
   * Complete bi formation data
   * Bottom -> ... -> Top -> ... -> Bottom pattern
   */
  static completeBi(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 105, 95, 1),
      this.createKVo(3, 110, 100, 2), // bottom fenxing area
      this.createKVo(4, 115, 105, 3),
      this.createKVo(5, 120, 110, 4),
      this.createKVo(6, 125, 115, 5),
      this.createKVo(7, 130, 120, 6), // top fenxing area
      this.createKVo(8, 125, 115, 7),
      this.createKVo(9, 120, 110, 8),
    ];
  }

  /**
   * K-lines that form alternating fenxings
   * Top -> Bottom -> Top pattern
   */
  static alternatingFenxings(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 105, 95, 1),
      this.createKVo(3, 110, 100, 2),
      this.createKVo(4, 115, 105, 3), // potential top
      this.createKVo(5, 120, 110, 4),
      this.createKVo(6, 115, 100, 5), // top fenxing
      this.createKVo(7, 110, 95, 6),
      this.createKVo(8, 105, 90, 7), // bottom fenxing
      this.createKVo(9, 110, 95, 8),
      this.createKVo(10, 115, 100, 9), // top fenxing
    ];
  }

  /**
   * K-lines with containment between fenxings
   * Top contains Bottom (should mark erasure)
   */
  static fenxingContainment(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 105, 95, 1),
      this.createKVo(3, 95, 85, 2), // bottom fenxing candidate
      this.createKVo(4, 100, 90, 3),
      this.createKVo(5, 110, 90, 4), // top fenxing that contains previous bottom
      this.createKVo(6, 105, 95, 5),
      this.createKVo(7, 100, 90, 6),
    ];
  }

  /**
   * K-lines with no clear fenxings
   */
  static noFenxings(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 105, 95, 1),
      this.createKVo(3, 110, 100, 2),
      this.createKVo(4, 115, 105, 3),
      this.createKVo(5, 120, 110, 4),
    ];
  }

  /**
   * Empty K-line array
   */
  static empty(): KVo[] {
    return [];
  }

  /**
   * Single K-line
   */
  static single(): KVo[] {
    return [this.createKVo(1, 100, 90, 0)];
  }

  /**
   * K-lines with two consecutive same-type fenxings
   * Should keep the more extreme one
   */
  static consecutiveSameTypeFenxings(): KVo[] {
    return [
      this.createKVo(1, 100, 90, 0),
      this.createKVo(2, 110, 100, 1),
      this.createKVo(3, 120, 110, 2),
      this.createKVo(4, 115, 105, 3), // first top fenxing (high=115)
      this.createKVo(5, 110, 100, 4),
      this.createKVo(6, 115, 105, 5),
      this.createKVo(7, 125, 115, 6), // second top fenxing (high=125) - more extreme
      this.createKVo(8, 120, 110, 7),
    ];
  }
}
