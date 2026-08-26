import { Controller, Get } from '@nestjs/common';
import { HealthStateService } from './health-state.service';
import type { SignalHealthVo } from './health.vo';

@Controller()
export class HealthController {
  constructor(private readonly healthState: HealthStateService) {}

  @Get('health')
  getHealth(): SignalHealthVo {
    return this.healthState.snapshot();
  }
}
