import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { parseRedisConnectionUrl } from '@app/realtime';
import {
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
} from '@app/signal';
import {
  Security,
  StrategyAlertDelivery,
  StrategyAlertEvent,
  StrategySignal,
} from '@app/shared-data';
import { CHANNEL_ADAPTERS } from '../channels/channel-adapter.port';
import { QqChannelAdapter } from '../channels/qq.channel-adapter';
import { WeComChannelAdapter } from '../channels/wechat.channel-adapter';
import { AlertChannelDeliveryService } from './alert-channel-delivery.service';
import { AlertFanoutService } from './alert-fanout.service';
import { StrategyAlertDeliveryWorker } from './strategy-alert-delivery.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StrategyAlertEvent,
      StrategySignal,
      Security,
      StrategyAlertDelivery,
    ]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      extraOptions: { manualRegistration: true },
      useFactory(config: ConfigService) {
        return {
          prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
          connection: {
            ...parseRedisConnectionUrl(
              config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
            ),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: STRATEGY_ALERT_DELIVERY_QUEUE_NAME }),
  ],
  providers: [
    AlertFanoutService,
    AlertChannelDeliveryService,
    StrategyAlertDeliveryWorker,
    QqChannelAdapter,
    WeComChannelAdapter,
    {
      provide: CHANNEL_ADAPTERS,
      inject: [QqChannelAdapter, WeComChannelAdapter],
      useFactory: (qq: QqChannelAdapter, wecom: WeComChannelAdapter) => [
        qq,
        wecom,
      ],
    },
  ],
})
export class NotificationDeliveryModule {}
