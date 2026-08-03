import { Injectable, Optional } from '@nestjs/common';
import { CanonicalRealtimeSnapshot } from './realtime.types';
import type { RealtimeSource } from './realtime.types';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';
import { marketSeriesKey } from './candle/market-series-key';
import { resolveCandleBucket } from './candle/candle-bucket.util';

@Injectable()
export class RealtimeSnapshotIngressService {
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
    }
    if (bucket) {
      this.tradingDayBySecurity.set(snapshot.securityId, bucket.tradingDay);
    }
    this.latestBySeries.set(
      marketSeriesKey(snapshot.securityId, snapshot.source),
      snapshot,
    );
    this.latestBySecurity.set(snapshot.securityId, snapshot);
    this.product?.handleSnapshot(snapshot);
    return snapshot;
  }

  read(securityId: number) {
    return this.latestBySecurity.get(securityId) ?? null;
  }

  readSeries(securityId: number, source: RealtimeSource) {
    return this.latestBySeries.get(marketSeriesKey(securityId, source)) ?? null;
  }
}
