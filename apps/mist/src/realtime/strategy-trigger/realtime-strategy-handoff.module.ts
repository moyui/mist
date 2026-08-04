import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { parseRedisConnectionUrl } from '@app/realtime';
import {
  STRATEGY_TRIGGER_BULLMQ_PREFIX,
  STRATEGY_TRIGGER_QUEUE_NAME,
} from '@app/signal';
import { BullMqCandleFinalizationHandoffService } from './bullmq-candle-finalization-handoff.service';
import { CANDLE_FINALIZATION_HANDOFF_PORT } from './candle-finalization-handoff.port';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory(config: ConfigService) {
        return {
          prefix: STRATEGY_TRIGGER_BULLMQ_PREFIX,
          connection: {
            ...parseRedisConnectionUrl(
              config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
            ),
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            connectTimeout: 5_000,
            commandTimeout: 3_000,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: STRATEGY_TRIGGER_QUEUE_NAME }),
  ],
  providers: [
    BullMqCandleFinalizationHandoffService,
    {
      provide: CANDLE_FINALIZATION_HANDOFF_PORT,
      useExisting: BullMqCandleFinalizationHandoffService,
    },
  ],
  exports: [CANDLE_FINALIZATION_HANDOFF_PORT],
})
export class RealtimeStrategyHandoffModule {}
