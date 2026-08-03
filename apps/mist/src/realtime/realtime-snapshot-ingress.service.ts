import { Injectable, Optional } from '@nestjs/common';
import { CanonicalRealtimeSnapshot } from './realtime.types';
import type { RealtimeSource } from './realtime.types';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';
import { marketSeriesKey } from './candle/market-series-key';

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

  constructor(
    @Optional()
    private readonly product?: RealtimeMarketDataProductService,
  ) {}

  handleSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
  ): CanonicalRealtimeSnapshot {
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
