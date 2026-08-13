import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { TimezoneModule } from '@app/timezone';
import { QqChannelAdapter } from '../channels/qq.channel-adapter';
import { WeComChannelAdapter } from '../channels/wechat.channel-adapter';
import { OoAlertDeliveryCounters } from './oo-alert-delivery-counters';
import { OoAlertDeliveryWorker } from './oo-alert-delivery.worker';
import { OoAlertMetricsBootstrap } from './oo-alert-metrics.bootstrap';
import { OoAlertQueueService } from './oo-alert-queue.service';
import { OoAlertReceiverController } from './oo-alert-receiver.controller';
import {
  OO_ALERT_QUEUE_NAME,
  OO_ALERT_WECHAT_ADAPTER,
} from './oo-alert.constants';

/**
 * OO health-alert ingress + delivery: webhook receiver -> isTradingSession
 * filter -> dedicated oo-alert-delivery queue -> worker -> dedicated WeCom
 * adapter (own bot) + shared QQ adapter. Delivery outcomes are counted in the
 * dedicated OoAlertDeliveryCounters and exported as mist_oo_alert_total —
 * never mixed into the strategy-only mist_notification_* gauges (M1).
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
    OoAlertDeliveryCounters,
    OoAlertMetricsBootstrap,
    {
      provide: OO_ALERT_WECHAT_ADAPTER,
      useFactory: (config: ConfigService) =>
        new WeComChannelAdapter(config, 'OO_ALERT_WECHAT_WEBHOOK'),
      inject: [ConfigService],
    },
  ],
  exports: [OoAlertQueueService],
})
export class OoAlertModule {}
