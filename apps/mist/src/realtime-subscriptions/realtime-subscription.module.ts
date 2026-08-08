import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RealtimeSubscriptionAssignment } from '@app/shared-data';
import { RealtimeSubscriptionController } from './realtime-subscription.controller';
import { RealtimeSubscriptionService } from './realtime-subscription.service';
import { RealtimeSubscriptionRuntimeRegistry } from './realtime-subscription-runtime.registry';
import { RealtimeSubscriptionLifecycleCoordinator } from './realtime-subscription-lifecycle.coordinator';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RealtimeSubscriptionAssignment]),
    ScheduleModule.forRoot(),
  ],
  controllers: [RealtimeSubscriptionController],
  providers: [
    RealtimeSubscriptionService,
    RealtimeSubscriptionRuntimeRegistry,
    RealtimeSubscriptionLifecycleObservationStore,
    RealtimeSubscriptionLifecycleCoordinator,
  ],
  exports: [
    RealtimeSubscriptionService,
    RealtimeSubscriptionRuntimeRegistry,
    RealtimeSubscriptionLifecycleObservationStore,
  ],
})
export class RealtimeSubscriptionModule {}
