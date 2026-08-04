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
import { RealtimeMarketObservabilityService } from './realtime-market-observability.service';
import { RealtimeCandleDiagnosticController } from './candle/realtime-candle-diagnostic.controller';
import { RealtimeCandleHealthService } from './candle/realtime-candle-health.service';
import { resolveRealtimeStrategyMode } from '@app/config';
import { RealtimeStrategyHandoffModule } from './strategy-trigger/realtime-strategy-handoff.module';
import { RealtimeStrategyStartupCompensationService } from './strategy-trigger/realtime-strategy-startup-compensation.service';
import { RealtimeStrategyHandoffObservabilityService } from './strategy-trigger/realtime-strategy-handoff-observability.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SecuritySourceConfig]),
    ...realtimeStrategyHandoffModulesForMode(
      resolveRealtimeStrategyMode(process.env.REALTIME_STRATEGY_MODE),
    ),
  ],
  controllers: [RealtimeCandleDiagnosticController],
  providers: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
    OpenCandleAggregator,
    CandleFinalizer,
    RealtimeMarketDataProductService,
    RealtimeMarketObservabilityService,
    RealtimeCandleHealthService,
    RealtimeStrategyStartupCompensationService,
    RealtimeStrategyHandoffObservabilityService,
  ],
  exports: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
    RealtimeMarketObservabilityService,
  ],
})
export class RealtimeIngressModule {}

export function realtimeStrategyHandoffModulesForMode(
  mode: 'off' | 'shadow' | 'on',
) {
  return mode === 'off' ? [] : [RealtimeStrategyHandoffModule];
}
