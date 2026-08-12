import { Module } from '@nestjs/common';
import { BullMqStrategyAlertDeliveryHandoffService } from './bullmq-strategy-alert-delivery-handoff.service';
import { STRATEGY_ALERT_DELIVERY_HANDOFF_PORT } from './strategy-alert-delivery-handoff.port';

@Module({
  providers: [
    BullMqStrategyAlertDeliveryHandoffService,
    {
      provide: STRATEGY_ALERT_DELIVERY_HANDOFF_PORT,
      useExisting: BullMqStrategyAlertDeliveryHandoffService,
    },
  ],
  exports: [STRATEGY_ALERT_DELIVERY_HANDOFF_PORT],
})
export class StrategyAlertDeliveryHandoffModule {}
