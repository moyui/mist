import { ApiProperty } from '@nestjs/swagger';
import type { BaseHealthVo, HealthStatus } from '@app/observability';

export class BackendHealthVo implements BaseHealthVo {
  @ApiProperty({ example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'mist-backend' })
  service!: string;

  @ApiProperty({ example: 'backend' })
  instance!: string;

  @ApiProperty({ example: '2026-08-26T03:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  productizationMode!: 'off' | 'shadow' | 'on';

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  strategyMode!: 'off' | 'shadow' | 'on';

  @ApiProperty({ example: true })
  redisAvailable!: boolean;

  @ApiProperty({ example: 4 })
  allowlistCount!: number;
}
