import type { BaseHealthVo, HealthStatus } from '@app/observability';

export interface NotificationHealthVo extends BaseHealthVo {
  status: HealthStatus;
  service: 'notification';
  instance: 'notification';
  timestamp: string;
}
