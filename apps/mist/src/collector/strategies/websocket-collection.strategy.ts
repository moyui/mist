import { Injectable } from '@nestjs/common';
import { Period } from '@app/shared-data';
import {
  IDataCollectionStrategy,
  CollectionMode,
  CollectionResult,
} from './data-collection.strategy.interface';
import {
  ITimeWindowStrategy,
  CollectionWindow,
} from '../time-window/time-window.strategy.interface';
import {
  IKLineMergeService,
  RawKLineData,
} from '../kline-merge/kline-merge.service';

/**
 * WebSocket-based real-time data collection strategy (stub implementation).
 *
 * This is a placeholder for future WebSocket-based real-time data collection.
 * WebSocket collection would provide:
 * - Real-time streaming of K-line updates
 * - Lower latency compared to HTTP polling
 * - Bidirectional communication with data source
 * - Event-driven updates
 *
 * TODO: Implement WebSocket connection management
 * - WebSocket client initialization
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Message parsing and validation
 * - Error handling and recovery
 * - Data buffering and persistence
 */
@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  // TODO: Initialize with appropriate time window and merge strategies
  private readonly timeWindowStrategy: ITimeWindowStrategy;
  private readonly kLineMergeService: IKLineMergeService;

  constructor(
    timeWindowStrategy: ITimeWindowStrategy,
    kLineMergeService: IKLineMergeService,
  ) {
    this.timeWindowStrategy = timeWindowStrategy;
    this.kLineMergeService = kLineMergeService;
  }

  /**
   * Get the collection mode supported by this strategy.
   */
  getCollectionMode(): CollectionMode {
    return CollectionMode.REALTIME;
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
   * TODO: Implement validation based on WebSocket server capabilities
   */
  canCollect(securityCode: string): boolean {
    // Stub: accept all non-empty security codes
    return securityCode && securityCode.trim().length > 0;
  }

  /**
   * Collect K-line data for a given security and period.
   *
   * TODO: Implement WebSocket-based collection
   * Current implementation throws an error as this is not yet implemented.
   *
   * @param securityCode - Security code
   * @param period - Time period for K-line data
   * @param window - Collection window
   * @returns Promise resolving to collection result
   */
  async collect(
    securityCode: string,
    period: Period,
    window: CollectionWindow,
  ): Promise<CollectionResult> {
    // Stub implementation: not yet implemented
    return {
      count: 0,
      startTime: window.startTime,
      endTime: window.endTime,
      source: 'websocket',
      mode: this.getCollectionMode(),
      success: false,
      error: 'WebSocket collection strategy not yet implemented',
    };
  }
}
