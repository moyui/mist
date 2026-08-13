import { Injectable, OnModuleInit } from '@nestjs/common';
import { registerOoAlertMetrics } from '../observability/oo-alert-metrics';
import { OoAlertDeliveryCounters } from './oo-alert-delivery-counters';

/**
 * Registers the mist_oo_alert_total gauge on module init (M1). Mirror of
 * NotificationMetricsBootstrap: OTel gauge registration is a side effect that
 * runs once per process after the counters are instantiated.
 */
@Injectable()
export class OoAlertMetricsBootstrap implements OnModuleInit {
  constructor(private readonly counters: OoAlertDeliveryCounters) {}

  onModuleInit(): void {
    registerOoAlertMetrics(this.counters);
  }
}
