import { Injectable, Logger, Optional } from '@nestjs/common';
import { CanonicalRealtimeSnapshot } from './realtime.types';
import type { RealtimeSource } from './realtime.types';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';
import { trace } from '@opentelemetry/api';
import { marketSeriesKey } from './candle/market-series-key';
import { resolveCandleBucket } from './candle/candle-bucket.util';

@Injectable()
export class RealtimeSnapshotIngressService {
  private readonly logger = new Logger(RealtimeSnapshotIngressService.name);
  private readonly latestBySeries = new Map<
    string,
    CanonicalRealtimeSnapshot
  >();
  private readonly latestBySecurity = new Map<
    number,
    CanonicalRealtimeSnapshot
  >();
  private readonly tradingDayBySecurity = new Map<number, string>();

  constructor(
    @Optional()
    private readonly product?: RealtimeMarketDataProductService,
  ) {}

  handleSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
  ): CanonicalRealtimeSnapshot {
    const bucket = snapshot.eventTime
      ? resolveCandleBucket(snapshot.eventTime)
      : null;
    const previousTradingDay = this.tradingDayBySecurity.get(
      snapshot.securityId,
    );
    if (
      bucket &&
      previousTradingDay !== undefined &&
      previousTradingDay !== bucket.tradingDay
    ) {
      const prefix = `${snapshot.securityId}:`;
      for (const key of this.latestBySeries.keys()) {
        if (key.startsWith(prefix)) this.latestBySeries.delete(key);
      }
      this.latestBySecurity.delete(snapshot.securityId);
      trace.getActiveSpan()?.addEvent('trading_day_rollover', {
        securityId: snapshot.securityId,
        tradingDay: bucket.tradingDay,
      });
      this.logger.log(
        `candle trading_day_rollover securityId=${snapshot.securityId} day=${bucket.tradingDay}`,
      );
    }
    if (bucket) {
      this.tradingDayBySecurity.set(snapshot.securityId, bucket.tradingDay);
    }
    this.latestBySeries.set(
      marketSeriesKey(snapshot.securityId, snapshot.source),
      snapshot,
    );
    this.latestBySecurity.set(snapshot.securityId, snapshot);
    try {
      this.product?.handleSnapshot(snapshot);
    } catch (error) {
      // Not silent anymore: span event + warn log (previously only log).
      trace.getActiveSpan()?.addEvent('product_sink_failed', {
        securityId: snapshot.securityId,
        source: snapshot.source,
      });
      this.logger.warn(
        `candle product_sink_failed securityId=${snapshot.securityId} source=${snapshot.source} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return snapshot;
  }

  read(securityId: number) {
    return this.latestBySecurity.get(securityId) ?? null;
  }

  readSeries(securityId: number, source: RealtimeSource) {
    return this.latestBySeries.get(marketSeriesKey(securityId, source)) ?? null;
  }

  removeSeries(securityId: number, source: RealtimeSource): void {
    this.latestBySeries.delete(marketSeriesKey(securityId, source));
    if (this.latestBySecurity.get(securityId)?.source === source) {
      this.latestBySecurity.delete(securityId);
    }
    if (
      ![...this.latestBySeries.keys()].some((key) =>
        key.startsWith(`${securityId}:`),
      )
    ) {
      this.tradingDayBySecurity.delete(securityId);
    }
  }
}
