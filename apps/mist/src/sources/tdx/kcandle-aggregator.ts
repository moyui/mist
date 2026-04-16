import { EventEmitter } from 'events';
import { set } from 'date-fns';
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
      // Remove old candle to prevent memory leak
      this.candles.delete(key);
    }

    // Create or update candle
    let candle: InProgressCandle;

    if (existing && existing.timestamp.getTime() === candleTime.getTime()) {
      // Same period: update existing candle
      candle = existing;
      candle.high = Math.max(candle.high, snapshot.now);
      candle.low = Math.min(candle.low, snapshot.now);
      candle.close = snapshot.now;
      candle.volume += snapshot.volume;
      candle.amount += snapshot.amount;
    } else {
      // New period: start fresh candle
      candle = {
        timestamp: candleTime,
        open: snapshot.open,
        high: snapshot.now,
        low: snapshot.now,
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
    switch (period) {
      case Period.ONE_MIN:
        return set(timestamp, { seconds: 0, milliseconds: 0 });

      case Period.FIVE_MIN: {
        const minutes5 = Math.floor(timestamp.getMinutes() / 5) * 5;
        return set(timestamp, {
          minutes: minutes5,
          seconds: 0,
          milliseconds: 0,
        });
      }

      case Period.FIFTEEN_MIN: {
        const minutes15 = Math.floor(timestamp.getMinutes() / 15) * 15;
        return set(timestamp, {
          minutes: minutes15,
          seconds: 0,
          milliseconds: 0,
        });
      }

      case Period.THIRTY_MIN: {
        const minutes30 = Math.floor(timestamp.getMinutes() / 30) * 30;
        return set(timestamp, {
          minutes: minutes30,
          seconds: 0,
          milliseconds: 0,
        });
      }

      case Period.SIXTY_MIN:
        return set(timestamp, { minutes: 0, seconds: 0, milliseconds: 0 });

      default:
        return set(timestamp, {
          hours: 0,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
        });
    }
  }

  private makeKey(stockCode: string, period: Period): string {
    return `${stockCode}:${period}`;
  }
}
