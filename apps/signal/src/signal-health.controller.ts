import { Controller, Get } from '@nestjs/common';
import { SignalHealthStateService } from './signal-health-state.service';
import type { SignalHealthVo } from './signal-health.vo';

@Controller()
export class SignalHealthController {
  constructor(private readonly healthState: SignalHealthStateService) {}

  @Get('health')
  getHealth(): SignalHealthVo {
    return this.healthState.snapshot();
  }
}
