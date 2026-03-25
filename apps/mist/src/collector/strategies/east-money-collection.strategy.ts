import { Injectable } from '@nestjs/common';
import { Period, DataSource } from '@app/shared-data';
import {
  IDataCollectionStrategy,
  CollectionMode,
  CollectionResult,
} from './data-collection.strategy.interface';
import {
  ITimeWindowStrategy,
  CollectionWindow,
} from '../time-window/time-window.strategy.interface';
import { EastMoneyTimeWindowStrategy } from '../time-window/east-money-time-window.strategy';
import { IKLineMergeService } from '../kline-merge/kline-merge.service';
import { EastMoneyKLineMergeService } from '../kline-merge/east-money-kline-merge.service';

/**
 * East Money (东方财富) data collection strategy implementation.
 *
 * Features:
 * - Scheduled collection mode (not real-time WebSocket)
 * - Uses East Money HTTP API for data retrieval
 * - Supports all security codes (SH/SZ exchanges)
 * - Integrates with EastMoneyTimeWindowStrategy for time windows
 * - Integrates with EastMoneyKLineMergeService for data merging
 *
 * TODO: Implement actual East Money API integration
 * - HTTP client for East Money API endpoints
 * - Authentication if required
 * - Rate limiting and error handling
 * - Data parsing and validation
 */
@Injectable()
export class EastMoneyCollectionStrategy implements IDataCollectionStrategy {
  private readonly timeWindowStrategy: ITimeWindowStrategy;
  private readonly kLineMergeService: IKLineMergeService;
  private readonly source: DataSource = DataSource.EAST_MONEY;

  constructor() {
    this.timeWindowStrategy = new EastMoneyTimeWindowStrategy();
    this.kLineMergeService = new EastMoneyKLineMergeService();
  }

  /**
   * Get the collection mode supported by this strategy.
   */
  getCollectionMode(): CollectionMode {
    return CollectionMode.SCHEDULED;
  }

  /**
   * Get the time window strategy used by this collection strategy.
   */
  getTimeWindowStrategy(): ITimeWindowStrategy {
    return this.timeWindowStrategy;
  }

  /**
   * Get the K-line merge service used by this collection strategy.
   */
  getKLineMergeService(): IKLineMergeService {
    return this.kLineMergeService;
  }

  /**
   * Validate if this strategy can collect data for the given security.
   *
   * East Money supports all A-share securities with format:
   * - 6-digit code + .SH (Shanghai) or .SZ (Shenzhen)
   * - Examples: 000001.SH, 600000.SH, 000001.SZ, 300001.SZ
   */
  canCollect(securityCode: string): boolean {
    if (!securityCode || securityCode.trim().length === 0) {
      return false;
    }

    // Check format: 6 digits + .SH or .SZ
    const pattern = /^\d{6}\.(SH|SZ)$/;
    return pattern.test(securityCode);
  }

  /**
   * Collect K-line data for a given security and period.
   *
   * TODO: Implement actual East Money API call
   * Current implementation is a stub that returns empty results.
   *
   * @param securityCode - Security code (e.g., '000001.SH')
   * @param period - Time period for K-line data
   * @param window - Collection window (time range and recency requirements)
   * @returns Promise resolving to collection result
   */
  async collect(
    securityCode: string,
    period: Period,
    window: CollectionWindow,
  ): Promise<CollectionResult> {
    // Validate security code
    if (!this.canCollect(securityCode)) {
      return {
        count: 0,
        startTime: window.startTime,
        endTime: window.endTime,
        source: this.source,
        mode: this.getCollectionMode(),
        success: false,
        error: `Invalid security code format: ${securityCode}`,
      };
    }

    try {
      // TODO: Implement actual East Money API call
      // 1. Construct API URL based on security code and period
      // 2. Make HTTP request to East Money API
      // 3. Parse response and validate data
      // 4. Merge data if needed using kLineMergeService
      // 5. Store data in database
      // 6. Return collection result

      // Stub implementation: return empty result
      return {
        count: 0,
        startTime: window.startTime,
        endTime: window.endTime,
        source: this.source,
        mode: this.getCollectionMode(),
        success: true,
      };
    } catch (error) {
      return {
        count: 0,
        startTime: window.startTime,
        endTime: window.endTime,
        source: this.source,
        mode: this.getCollectionMode(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
