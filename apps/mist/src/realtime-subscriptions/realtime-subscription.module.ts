import { Global, Module } from '@nestjs/common';
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
export class RealtimeSubscriptionModule {}
