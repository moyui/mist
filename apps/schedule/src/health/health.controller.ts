import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RawResponse } from '@app/transport/http';
import { ScheduleHealthVo } from './health.vo';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @RawResponse()
  @ApiOperation({
    summary: 'Schedule service health check',
    description: 'Returns health status for schedule service',
  })
  @ApiResponse({ status: 200, type: ScheduleHealthVo })
  getHealth(): ScheduleHealthVo {
    return {
      status: 'ok',
      service: 'schedule',
      instance: 'schedule',
      timestamp: new Date().toISOString(),
    };
  }
}
