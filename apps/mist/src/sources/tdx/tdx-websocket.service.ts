import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { KCandleAggregator, CompletedCandle } from './kcandle-aggregator';
import { Period, Security } from '@app/shared-data';
import { TdxResponse, TdxSnapshot } from './types';
import { TimezoneService } from '@app/timezone';

type SnapshotCallback = (snapshot: TdxSnapshot) => void | Promise<void>;
type CandleCompleteCallback = (
  candle: TdxResponse,
  security: Security,
  period: Period,
) => void | Promise<void>;

@Injectable()
export class TdxWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TdxWebSocketService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();
  private snapshotCallbacks: SnapshotCallback[] = [];
  private candleCallbacks: CandleCompleteCallback[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly reconnectDelay = 5000;
  private readonly heartbeatIntervalMs = 30000;

  constructor(
    private readonly configService: ConfigService,
    private readonly aggregator: KCandleAggregator,
    private readonly timezoneService: TimezoneService,
  ) {
    this.baseUrl =
      this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.clientId =
      this.configService.get<string>('TDX_WS_CLIENT_ID') || 'mist-backend-tdx';

    // Convert HTTP URL to WS URL and build WebSocket path
    const wsBaseUrl = this.baseUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    this.wsUrl = `${wsBaseUrl}/ws/quote/${this.clientId}`;

    // Initialize aggregator callback to bridge candles to candleCallbacks
    this.aggregator.on('candle', (candle: CompletedCandle) => {
      this.handleCompletedCandle(candle);
    });
  }

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }

  onSnapshot(callback: SnapshotCallback): void {
    this.snapshotCallbacks.push(callback);
  }

  onCandleComplete(callback: CandleCompleteCallback): void {
    this.candleCallbacks.push(callback);
  }

  subscribe(stockCode: string): void {
    this.subscriptions.add(stockCode);
    this.sendSubscription();
  }

  unsubscribe(stockCode: string): void {
    this.subscriptions.delete(stockCode);
    this.sendSubscription();
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === WebSocket.OPEN) return 'connected';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'connecting';
    return 'disconnected';
  }

  /**
   * Get WebSocket connection info for debugging
   */
  getConnectionInfo(): { url: string; clientId: string; status: string } {
    return {
      url: this.wsUrl,
      clientId: this.clientId,
      status: this.getConnectionStatus(),
    };
  }

  private connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.logger.log(`Connecting to TDX WebSocket: ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.logger.log('TDX WebSocket connected');
        this.clearReconnectTimeout();
        this.sendSubscription();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error(`TDX WebSocket error: ${error.message}`);
      });

      this.ws.on('close', () => {
        this.logger.warn('TDX WebSocket disconnected, reconnecting...');
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(`Failed to connect to TDX WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'pong') {
        // Heartbeat response
        return;
      }

      if (message.type === 'quote') {
        const snapshot = this.parseSnapshot(message.data);
        this.processSnapshot(snapshot);
      }
    } catch (error) {
      this.logger.error(`Failed to handle WebSocket message: ${error}`);
    }
  }

  private parseSnapshot(data: {
    stock_code: string;
    snapshot: any;
  }): TdxSnapshot {
    const s = data.snapshot;
    return {
      stockCode: data.stock_code,
      now: Number(s.Now || s.now),
      open: Number(s.Open || s.open),
      high: Number(s.Max || s.high),
      low: Number(s.Min || s.low),
      lastClose: Number(s.LastClose || s.lastClose),
      volume: Number(s.Volume || s.volume),
      amount: Number(s.Amount || s.amount),
      timestamp: this.timezoneService.getCurrentBeijingTime(),
    };
  }

  private processSnapshot(snapshot: TdxSnapshot): void {
    // Notify snapshot callbacks
    for (const callback of this.snapshotCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(`Snapshot callback error: ${error}`);
      }
    }

    // Aggregate into K-lines for subscribed periods
    const periods = [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
    ];

    for (const period of periods) {
      try {
        this.aggregator.process(snapshot.stockCode, period, snapshot);
      } catch (error) {
        this.logger.error(`Aggregator error for ${period}: ${error}`);
      }
    }
  }

  private sendSubscription(): void {
    if (
      this.ws?.readyState !== WebSocket.OPEN ||
      this.subscriptions.size === 0
    ) {
      return;
    }

    const message = JSON.stringify({
      type: 'subscribe',
      stocks: Array.from(this.subscriptions),
    });

    this.ws.send(message);
  }

  private startHeartbeat(): void {
    // Clear existing interval if any
    this.clearHeartbeat();

    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        this.clearHeartbeat();
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log('Reconnecting to TDX WebSocket...');
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private handleCompletedCandle(candle: CompletedCandle): void {
    // Convert to TdxResponse format
    const tdxResponse: TdxResponse = {
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      amount: candle.amount,
    };

    // Find security for this stock code (simplified - in production, cache this)
    const security: Partial<Security> = {
      code: candle.stockCode.replace(/^SH|SZ/, ''),
    };

    for (const callback of this.candleCallbacks) {
      try {
        callback(tdxResponse, security as Security, candle.period);
      } catch (error) {
        this.logger.error(`Candle callback error: ${error}`);
      }
    }
  }
}
