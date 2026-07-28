import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';
import { Clock } from './clock.service';
import { RealtimeRedisService } from './realtime-redis.service';
import { OpenCandleAggregator } from './candle/open-candle-aggregator';
import { CandleFinalizer } from './candle/candle-finalizer';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecuritySourceConfig])],
  providers: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
    OpenCandleAggregator,
    CandleFinalizer,
    RealtimeMarketDataProductService,
  ],
  exports: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
  ],
})
export class RealtimeIngressModule {}
