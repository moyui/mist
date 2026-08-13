import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TimezoneModule } from '@app/timezone';
import { QqChannelAdapter } from '../channels/qq.channel-adapter';
import { WeComChannelAdapter } from '../channels/wechat.channel-adapter';
import { NotificationDeliveryCounters } from '../delivery/notification-delivery-counters';
import { OoAlertDeliveryWorker } from './oo-alert-delivery.worker';
import { OoAlertQueueService } from './oo-alert-queue.service';
import { OoAlertReceiverController } from './oo-alert-receiver.controller';
import {
  OO_ALERT_QUEUE_NAME,
  OO_ALERT_WECHAT_ADAPTER,
} from './oo-alert.constants';

/**
 * OO health-alert ingress + delivery: webhook receiver -> isTradingSession
 * filter -> dedicated oo-alert-delivery queue -> worker -> dedicated WeCom
 * adapter (own bot) + shared QQ adapter.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: OO_ALERT_QUEUE_NAME }),
    TimezoneModule,
  ],
  controllers: [OoAlertReceiverController],
  providers: [
    OoAlertQueueService,
    OoAlertDeliveryWorker,
    QqChannelAdapter,
    NotificationDeliveryCounters,
    {
      provide: OO_ALERT_WECHAT_ADAPTER,
      useFactory: (config: ConfigService) =>
        new WeComChannelAdapter(config, 'OO_ALERT_WECHAT_WEBHOOK'),
      inject: [ConfigService],
    },
  ],
})
export class OoAlertModule {}
