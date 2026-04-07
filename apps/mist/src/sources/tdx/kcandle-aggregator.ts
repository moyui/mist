import { EventEmitter } from 'events';
import { Period } from '@app/shared-data';
import { TdxSnapshot } from './types';

interface InProgressCandle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface CompletedCandle extends InProgressCandle {
  stockCode: string;
  period: Period;
}

/**
 * Pure logic component for aggregating TDX snapshots into K-line candles
 * Thread-safe (Node.js single-threaded event loop guarantees ordering)
 */
export class KCandleAggregator {
  private readonly candles = new Map<string, InProgressCandle>();
  private readonly emitter = new EventEmitter();

  constructor() {
    // Set max listeners to accommodate multiple stocks + periods
    this.emitter.setMaxListeners(100);
  }

  /**
   * Register callback for completed candles
   */
  on(event: 'candle', callback: (candle: CompletedCandle) => void): void {
    this.emitter.on(event, callback);
  }

  /**
   * Process a snapshot and update aggregation state
   * Emits completed candle when period boundary is crossed
   */
  process(stockCode: string, period: Period, snapshot: TdxSnapshot): void {
    const key = this.makeKey(stockCode, period);
    const candleTime = this.getCandleTime(snapshot.timestamp, period);

    const existing = this.candles.get(key);

    // DEBUG
    // console.log(`[${stockCode}:${period}] snapshot=${snapshot.timestamp.toISOString()}, candleTime=${candleTime.toISOString()}, existing=${existing ? existing.timestamp.toISOString() : 'none'}`);

    // Check if period boundary crossed
    if (existing && existing.timestamp.getTime() !== candleTime.getTime()) {
      // Emit completed candle
      this.emitter.emit('candle', {
        stockCode,
        period,
        ...existing,
      } as CompletedCandle);
    }

    // Create or update candle
    let candle: InProgressCandle;

    if (existing && existing.timestamp.getTime() === candleTime.getTime()) {
      // Same period: update existing candle
      candle = existing;
      candle.high = Math.max(candle.high, snapshot.high);
      candle.low = Math.min(candle.low, snapshot.low);
      candle.close = snapshot.now;
      candle.volume += snapshot.volume;
      candle.amount += snapshot.amount;
    } else {
      // New period: start fresh candle
      candle = {
        timestamp: candleTime,
        open: snapshot.open,
        high: snapshot.high,
        low: snapshot.low,
        close: snapshot.now,
        volume: snapshot.volume,
        amount: snapshot.amount,
      };
    }

    this.candles.set(key, candle);
  }

  /**
   * Get current in-progress candle for a stock+period (for testing)
   */
  getCurrent(stockCode: string, period: Period): InProgressCandle | undefined {
    return this.candles.get(this.makeKey(stockCode, period));
  }

  /**
   * Get candle time (start of period) for a given timestamp
   * Boundary tick (exact on boundary) belongs to NEW candle
   */
  private getCandleTime(timestamp: Date, period: Period): Date {
    const dt = new Date(timestamp);

    switch (period) {
      case Period.ONE_MIN:
        // Floor to minute
        dt.setSeconds(0, 0);
        return dt;

      case Period.FIVE_MIN:
        // Align to :00, :05, :10, ...
        const minutes5 = Math.floor(dt.getMinutes() / 5) * 5;
        dt.setMinutes(minutes5, 0, 0);
        return dt;

      case Period.FIFTEEN_MIN:
        // Align to :00, :15, :30, :45
        const minutes15 = Math.floor(dt.getMinutes() / 15) * 15;
        dt.setMinutes(minutes15, 0, 0);
        return dt;

      case Period.THIRTY_MIN:
        // Align to :00, :30
        const minutes30 = Math.floor(dt.getMinutes() / 30) * 30;
        dt.setMinutes(minutes30, 0, 0);
        return dt;

      case Period.SIXTY_MIN:
        // Align to hour
        dt.setMinutes(0, 0, 0);
        return dt;

      default:
        // Daily and longer - not produced from snapshots
        dt.setHours(0, 0, 0, 0);
        return dt;
    }
  }

  private makeKey(stockCode: string, period: Period): string {
    return `${stockCode}:${period}`;
  }
}
