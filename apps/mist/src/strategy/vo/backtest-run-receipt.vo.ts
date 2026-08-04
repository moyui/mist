import { ApiProperty } from '@nestjs/swagger';

export class BacktestRunReceiptVo {
  @ApiProperty({ minimum: 1 })
  runId!: number;

  @ApiProperty({ enum: ['PENDING'] })
  initialStatus = 'PENDING' as const;
}
