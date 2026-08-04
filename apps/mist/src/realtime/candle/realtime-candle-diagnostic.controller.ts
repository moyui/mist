import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RealtimeCandleHealthService } from './realtime-candle-health.service';

/**
 * Read-only, low-cardinality health boundary consumed inside mist-network by
 * mist-monitoring. It deliberately omits security identities and native
 * values; detailed provider readback remains on the source diagnostics.
 */
@ApiTags('realtime-candles')
@Controller('internal/realtime/candles')
export class RealtimeCandleDiagnosticController {
  constructor(private readonly health: RealtimeCandleHealthService) {}

  @Get('status')
  getStatus() {
    return this.health.observe();
  }
}
