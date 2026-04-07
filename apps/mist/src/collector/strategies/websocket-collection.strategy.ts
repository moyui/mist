import { Injectable, Logger, Inject } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { ConfigService } from '@nestjs/config';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';
import { TdxWebSocketService } from '../../sources/tdx/tdx-websocket.service';
import { TdxResponse } from '../../sources/tdx/types';

/**
 * WebSocket data collection strategy
 *
 * - Mode: streaming (real-time push)
 * - For: TDX (delegates to TdxWebSocketService)
 * - For: MINI_QMT (stub, not yet implemented)
 */
@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  readonly source: DataSource;
  readonly mode: CollectionMode = 'streaming';

  private subscriptions: Set<string> = new Set();
  private tdxWsService: TdxWebSocketService | null = null;

  constructor(
    source: DataSource,
    private readonly collectorService: CollectorService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    @Inject(TdxWebSocketService) tdxWsService?: TdxWebSocketService,
  ) {
    if (source !== DataSource.TDX && source !== DataSource.MINI_QMT) {
      throw new Error(
        `WebSocket strategy only supports TDX and MINI_QMT, got ${source}`,
      );
    }
    this.source = source;

    // Inject TdxWebSocketService for TDX source
    if (source === DataSource.TDX && tdxWsService) {
      this.tdxWsService = tdxWsService;
      this.setupTdxCallbacks();
    }
  }

  private setupTdxCallbacks(): void {
    if (!this.tdxWsService) return;

    // Handle completed candles - save to database
    this.tdxWsService.onCandleComplete(
      async (candle: TdxResponse, security: Security, period: Period) => {
        try {
          // Convert TdxResponse to KData format
          const kData = {
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            amount: candle.amount || 0,
          };

          await this.collectorService.saveRawKData(
            security,
            [kData],
            DataSource.TDX,
            period,
          );

          this.logger.debug(
            `Saved ${period} candle for ${security.code} at ${candle.timestamp}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to save candle for ${security.code}: ${error}`,
          );
        }
      },
    );
  }

  async start(): Promise<void> {
    if (this.source === DataSource.TDX) {
      if (!this.tdxWsService) {
        this.logger.warn('TdxWebSocketService not available');
        return;
      }

      const status = this.tdxWsService.getConnectionStatus();
      if (status === 'connected') {
        this.logger.log('TDX WebSocket already connected');
        return;
      }

      this.logger.log('TDX WebSocket will auto-connect on module init');
      return;
    }

    // MINI_QMT not implemented
    this.logger.warn(
      `WebSocket strategy for ${this.source} is not yet implemented. Streaming mode is disabled.`,
    );
  }

  async stop(): Promise<void> {
    if (this.source === DataSource.TDX && this.tdxWsService) {
      // TdxWebSocketService handles its own lifecycle via OnModuleDestroy
      // Just clear our subscriptions
      for (const stockCode of this.subscriptions) {
        this.tdxWsService.unsubscribe(stockCode);
      }
      this.subscriptions.clear();
    }
  }

  async collectForSecurity(
    security: Security,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    period: Period,
  ): Promise<number> {
    if (this.source === DataSource.TDX) {
      if (!this.tdxWsService) {
        this.logger.warn('TdxWebSocketService not available');
        return 0;
      }

      // Subscribe to real-time data for this security
      const formatCode = this.getFormatCode(security);
      this.tdxWsService.subscribe(formatCode);
      this.subscriptions.add(formatCode);

      this.logger.log(
        `Subscribed to TDX WebSocket for ${security.code} (${formatCode})`,
      );

      // Return 1 to indicate subscription was set up
      // Actual data will be pushed via callbacks
      return 1;
    }

    // MINI_QMT not implemented
    this.logger.warn(
      `WebSocket subscription for ${this.source} is not yet implemented. Security ${security.code} will not receive streaming data.`,
    );
    return 0;
  }

  private getFormatCode(security: Security): string {
    const config = security.sourceConfigs?.find(
      (c) => c.source === DataSource.TDX && c.enabled,
    );
    return config?.formatCode || security.code;
  }
}
