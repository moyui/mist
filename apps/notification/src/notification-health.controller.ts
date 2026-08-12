import { Controller, Get } from '@nestjs/common';

export interface NotificationHealthVo {
  status: 'ok';
  instance: 'notification';
}

@Controller()
export class NotificationHealthController {
  @Get('health')
  getHealth(): NotificationHealthVo {
    return { status: 'ok', instance: 'notification' };
  }
}
