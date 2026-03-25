import { Injectable, Logger } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { ConfigService } from '@nestjs/config';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';

/**
 * WebSocket data collection strategy
 *
 * - Mode: streaming (real-time push)
 * - For: TDX, miniQMT
 * - Status: Stub for future implementation
 */
@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  readonly source: DataSource;
  readonly mode: CollectionMode = 'streaming';

  // TODO: Implement WebSocket client
  private wsClient: any = null;
  private subscriptions: Set<string> = new Set();

  constructor(
    source: DataSource,
    private readonly collectorService: CollectorService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    if (source !== DataSource.TDX && source !== DataSource.MINI_QMT) {
      throw new Error(
        `WebSocket strategy only supports TDX and MINI_QMT, got ${source}`,
      );
    }
    this.source = source;
  }

  async start(): Promise<void> {
    // TODO: Implement WebSocket connection
    this.logger.warn(
      `WebSocket strategy for ${this.source} is not yet implemented. Streaming mode is disabled.`,
    );
    // Return early instead of throwing to avoid crashing the scheduler
    return;
  }

  async stop(): Promise<void> {
    // TODO: Implement WebSocket disconnection
    if (this.wsClient) {
      await this.wsClient.disconnect();
      this.wsClient = null;
      this.subscriptions.clear();
    }
  }

  async collectForSecurity(
    security: Security,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    period: Period,
  ): Promise<void> {
    // TODO: Subscribe to WebSocket data
    this.logger.warn(
      `WebSocket subscription for ${this.source} is not yet implemented. Security ${security.code} will not receive streaming data.`,
    );
    // Return early instead of throwing to avoid crashing the scheduler
    return;
  }

  // TODO: Add WebSocket message handler
  // private async handleIncomingData(data: any): Promise<void> {
  //   // Parse and save data
  // }
}
