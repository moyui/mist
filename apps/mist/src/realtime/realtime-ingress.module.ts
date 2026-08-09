import { Global, Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import type { Repository } from 'typeorm';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';
import { Clock } from './clock.service';
import { RealtimeRedisService } from './realtime-redis.service';
import { OpenCandleAggregator } from './candle/open-candle-aggregator';
import { CandleFinalizer } from './candle/candle-finalizer';
import { RealtimeMarketDataProductService } from './candle/realtime-market-data-product.service';
import { isMockMode, resolveRealtimeStrategyMode } from '@app/config';
import { RealtimeStrategyHandoffModule } from './strategy-trigger/realtime-strategy-handoff.module';
import { RealtimeStrategyStartupCompensationService } from './strategy-trigger/realtime-strategy-startup-compensation.service';
import { RealtimeStrategyHandoffObservabilityService } from './strategy-trigger/realtime-strategy-handoff-observability.service';

/**
 * Mock-mode in-memory SecuritySourceConfig repository. The allowlist service
 * only queries the DB when a non-empty allowlist is configured with
 * lifecycle=off (realtime-security-allowlist.service.ts:44-80); mock mode
 * keeps allowlists empty so this is never invoked. Any unexpected query
 * fails fast rather than silently returning an empty result.
 *
 * Declared before the @Module decorator so the providers array can reference
 * it (decorators evaluate at module definition time).
 */
const mockSourceConfigRepository = {
  createQueryBuilder: () => {
    throw new Error(
      'mock mode: allowlist database resolution is unavailable; keep TDX/QMT_REALTIME_ALLOWLIST empty',
    );
  },
} as unknown as Repository<SecuritySourceConfig>;

@Global()
@Module({
  imports: [
    ...realtimePersistenceModulesForMode(isMockMode()),
    ...realtimeStrategyHandoffModulesForMode(
      resolveRealtimeStrategyMode(process.env.REALTIME_STRATEGY_MODE),
    ),
  ],
  controllers: [],
  providers: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
    OpenCandleAggregator,
    CandleFinalizer,
    RealtimeMarketDataProductService,
    RealtimeStrategyStartupCompensationService,
    RealtimeStrategyHandoffObservabilityService,
    ...(isMockMode()
      ? [
          {
            provide: getRepositoryToken(SecuritySourceConfig),
            useValue: mockSourceConfigRepository,
          },
        ]
      : []),
  ],
  exports: [
    RealtimeSnapshotIngressService,
    RealtimeSecurityAllowlistService,
    Clock,
    RealtimeRedisService,
  ],
})
export class RealtimeIngressModule {}

export function realtimeStrategyHandoffModulesForMode(
  mode: 'off' | 'shadow' | 'on',
) {
  return mode === 'off' ? [] : [RealtimeStrategyHandoffModule];
}

/**
 * Modules that require the SecuritySourceConfig repository. Mock mode
 * (MIST_MOCK_MODE=true) swaps the TypeORM forFeature for an in-memory stub;
 * production keeps the real repository.
 */
export function realtimePersistenceModulesForMode(isMock: boolean) {
  return isMock ? [] : [TypeOrmModule.forFeature([SecuritySourceConfig])];
}
