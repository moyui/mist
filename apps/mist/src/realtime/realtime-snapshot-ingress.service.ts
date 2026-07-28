import { Injectable, Optional } from '@nestjs/common';
import { CanonicalRealtimeSnapshot } from './realtime.types';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';

@Injectable()
export class RealtimeSnapshotIngressService {
  private readonly latest = new Map<string, CanonicalRealtimeSnapshot>();

  constructor(
    @Optional()
    private readonly product?: RealtimeMarketDataProductService,
  ) {}

  handleSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
  ): CanonicalRealtimeSnapshot {
    this.latest.set(String(snapshot.securityId), snapshot);
    this.product?.handleSnapshot(snapshot);
    return snapshot;
  }

  read(securityId: number) {
    return this.latest.get(String(securityId)) ?? null;
  }
}
