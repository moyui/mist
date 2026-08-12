import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import {
  RealtimeSubscriptionAssignment,
  RuntimeConfig,
} from '@app/shared-data';
import { RealtimeSubscriptionController } from './realtime-subscription.controller';
import { RealtimeSubscriptionService } from './realtime-subscription.service';
import { RealtimeSubscriptionRuntimeRegistry } from './realtime-subscription-runtime.registry';
import { RealtimeSubscriptionLifecycleCoordinator } from './realtime-subscription-lifecycle.coordinator';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';
import { RuntimeConfigService } from './runtime-config.service';
import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';
import { registerSubscriptionLifecycleMetrics } from '../realtime/observability/subscription-lifecycle-metrics';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RealtimeSubscriptionAssignment, RuntimeConfig]),
    ScheduleModule.forRoot(),
  ],
  controllers: [RealtimeSubscriptionController],
  providers: [
    RealtimeSubscriptionService,
    RealtimeSubscriptionRuntimeRegistry,
    RealtimeSubscriptionLifecycleObservationStore,
    RealtimeSubscriptionLifecycleCoordinator,
    RuntimeConfigService,
  ],
  exports: [
    RealtimeSubscriptionService,
    RealtimeSubscriptionRuntimeRegistry,
    RealtimeSubscriptionLifecycleObservationStore,
    RuntimeConfigService,
  ],
})
export class RealtimeSubscriptionModule implements OnModuleInit {
  constructor(
    private readonly observations: RealtimeSubscriptionLifecycleObservationStore,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  /**
   * Lifecycle gauges register with their owning module. main.ts no longer
   * resolves these providers, so mock mode (which excludes this module) boots
   * without DI failures and simply has no lifecycle gauges.
   */
  onModuleInit() {
    registerSubscriptionLifecycleMetrics(
      this.observations,
      this.allowlist,
      () => this.runtimeConfig.getAutoReconcileCached(),
    );
  }
}
