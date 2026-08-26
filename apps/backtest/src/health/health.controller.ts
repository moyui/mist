import { Controller, Get } from '@nestjs/common';
import { HealthStateService } from './health-state.service';
import type { BacktestHealthVo } from './health.vo';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthStateService) {}

  @Get('health')
  getHealth(): BacktestHealthVo {
    return this.health.snapshot();
  }
}
