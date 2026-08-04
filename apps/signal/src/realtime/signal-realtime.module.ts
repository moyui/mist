import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K } from '@app/shared-data';
import { parseRedisConnectionUrl } from '@app/realtime';
import {
  STRATEGY_TRIGGER_BULLMQ_PREFIX,
  STRATEGY_TRIGGER_QUEUE_NAME,
} from '@app/signal';
import { CandleFinalizedBullMqWorker } from './candle-finalized-bullmq.worker';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';
import { SignalStrategyMarketDataAdapter } from './signal-strategy-market-data.adapter';
import { SignalRegistryModule } from '../signal-registry.module';
import { SignalRegistryService } from '../signal-registry.service';
import { SignalRealtimeStartupService } from './signal-realtime-startup.service';
import { LiveStrategyPersistenceService } from './live-strategy-persistence.service';
import { resolveRealtimeStrategyMode } from '@app/config';

@Module({
  imports: [
    SignalRegistryModule,
    TypeOrmModule.forFeature([K]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      extraOptions: { manualRegistration: true },
      useFactory(config: ConfigService) {
        return {
          prefix: STRATEGY_TRIGGER_BULLMQ_PREFIX,
          connection: redisConnectionOptions(
            config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
          ),
        };
      },
    }),
    BullModule.registerQueue({ name: STRATEGY_TRIGGER_QUEUE_NAME }),
  ],
  providers: [
    SignalRealtimeRedisService,
    SignalStrategyMarketDataAdapter,
    LiveStrategyPersistenceService,
    {
      provide: CandleFinalizedJobProcessor,
      inject: [
        SignalStrategyMarketDataAdapter,
        SignalRegistryService,
        ConfigService,
        LiveStrategyPersistenceService,
      ],
      useFactory(
        marketData: SignalStrategyMarketDataAdapter,
        registry: SignalRegistryService,
        config: ConfigService,
        persistence: LiveStrategyPersistenceService,
      ) {
        return new CandleFinalizedJobProcessor(
          marketData,
          (securityId, source) =>
            registry.executionPlansFor(securityId, source),
          () => new Date(),
          undefined,
          undefined,
          config.get<number>('REALTIME_STRATEGY_JOB_TIMEOUT_MS') ?? 30_000,
          resolveRealtimeStrategyMode(
            config.get<string>('REALTIME_STRATEGY_MODE'),
          ) as 'shadow' | 'on',
          persistence,
        );
      },
    },
    CandleFinalizedBullMqWorker,
    SignalRealtimeStartupService,
  ],
})
export class SignalRealtimeModule {}

export function redisConnectionOptions(value: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, never>;
} {
  const parsed = parseRedisConnectionUrl(value);
  return {
    ...parsed,
    maxRetriesPerRequest: null,
  };
}
