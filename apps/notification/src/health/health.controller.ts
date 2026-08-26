import { Controller, Get } from '@nestjs/common';
import type { NotificationHealthVo } from './health.vo';

@Controller()
export class HealthController {
  @Get('health')
  getHealth(): NotificationHealthVo {
    return {
      status: 'ok',
      service: 'notification',
      instance: 'notification',
      timestamp: new Date().toISOString(),
    };
  }
}
