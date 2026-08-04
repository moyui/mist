import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Clock } from '../realtime/clock.service';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';

@ApiTags('realtime-subscription-lifecycle')
@Controller('internal/realtime/subscriptions')
export class RealtimeSubscriptionLifecycleDiagnosticController {
  constructor(
    private readonly observations: RealtimeSubscriptionLifecycleObservationStore,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  @Get('status')
  getStatus() {
    const mode =
      this.config.get<string>('REALTIME_SUBSCRIPTION_LIFECYCLE_MODE') === 'on'
        ? 'on'
        : 'off';
    return this.observations.health(mode, this.clock.nowDate());
  }
}
