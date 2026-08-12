import { Injectable, OnModuleInit } from '@nestjs/common';
import { registerDeliveryMetrics } from '../observability/delivery-metrics';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

/**
 * Triggers OTel metric registration on module init. Must run after
 * NotificationDeliveryCounters is instantiated (same module, deterministic DI).
 */
@Injectable()
export class NotificationMetricsBootstrap implements OnModuleInit {
  constructor(private readonly counters: NotificationDeliveryCounters) {}

  onModuleInit(): void {
    registerDeliveryMetrics(this.counters);
  }
}
