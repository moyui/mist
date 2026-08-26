import { ApiProperty } from '@nestjs/swagger';

export class BackendHealthVo {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'backend' })
  instance!: 'backend';

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  productizationMode!: 'off' | 'shadow' | 'on';

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  strategyMode!: 'off' | 'shadow' | 'on';

  @ApiProperty({ example: true })
  redisAvailable!: boolean;

  @ApiProperty({ example: 4 })
  allowlistCount!: number;
}
