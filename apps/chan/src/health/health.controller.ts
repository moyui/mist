import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RawResponse } from '@app/transport/http';
import { ChanHealthVo } from './health.vo';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @RawResponse()
  @ApiOperation({
    summary: 'Chan API health check',
    description: 'Returns health status for Chan service',
  })
  @ApiResponse({ status: 200, type: ChanHealthVo })
  getHealth(): ChanHealthVo {
    return {
      status: 'ok',
      service: 'chan',
      instance: 'chan',
      timestamp: new Date().toISOString(),
    };
  }
}
