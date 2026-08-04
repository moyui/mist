import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K } from '@app/shared-data';
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
    {
      provide: CandleFinalizedJobProcessor,
      inject: [SignalStrategyMarketDataAdapter, SignalRegistryService],
      useFactory(
        marketData: SignalStrategyMarketDataAdapter,
        registry: SignalRegistryService,
      ) {
        return new CandleFinalizedJobProcessor(
          marketData,
          (securityId, source) =>
            registry.executionPlansFor(securityId, source),
          () => new Date(),
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
  if (value.length === 0) {
    throw new Error(
      'MIST_REALTIME_REDIS_URL is required when realtime strategy is enabled',
    );
  }
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new TypeError('MIST_REALTIME_REDIS_URL must use redis or rediss');
  }
  const dbText = url.pathname.replace(/^\//, '');
  const db = dbText === '' ? 0 : Number(dbText);
  if (!Number.isSafeInteger(db) || db < 0) {
    throw new TypeError('MIST_REALTIME_REDIS_URL has an invalid database');
  }
  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(url.username === ''
      ? {}
      : { username: decodeURIComponent(url.username) }),
    ...(url.password === ''
      ? {}
      : { password: decodeURIComponent(url.password) }),
    db,
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
