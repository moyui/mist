import { ApiProperty } from '@nestjs/swagger';
import type { BaseHealthVo, HealthStatus } from '@app/observability';

export class ChanHealthVo implements BaseHealthVo {
  @ApiProperty({ example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'chan' })
  service!: string;

  @ApiProperty({ example: 'chan' })
  instance!: string;

  @ApiProperty({ example: '2026-08-26T03:00:00.000Z' })
  timestamp!: string;
}
