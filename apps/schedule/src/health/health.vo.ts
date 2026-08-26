import { ApiProperty } from '@nestjs/swagger';
import type { BaseHealthVo, HealthStatus } from '@app/observability';

export class ScheduleHealthVo implements BaseHealthVo {
  @ApiProperty({ example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'schedule' })
  service!: string;

  @ApiProperty({ example: 'schedule' })
  instance!: string;

  @ApiProperty({ example: '2026-08-26T03:00:00.000Z' })
  timestamp!: string;
}
