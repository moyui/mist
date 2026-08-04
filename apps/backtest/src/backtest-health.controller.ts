import { Controller, Get } from '@nestjs/common';
import { BacktestHealthStateService } from './backtest-health-state.service';
import type { BacktestHealthVo } from './backtest-health.vo';

@Controller()
export class BacktestHealthController {
  constructor(private readonly health: BacktestHealthStateService) {}

  @Get('health')
  getHealth(): BacktestHealthVo {
    return this.health.snapshot();
  }
}
