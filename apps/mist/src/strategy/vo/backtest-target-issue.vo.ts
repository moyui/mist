import { ApiProperty } from '@nestjs/swagger';
import type { BacktestTargetIssueCode } from '@app/shared-data';

export class BacktestTargetIssueVo {
  @ApiProperty()
  securityCode!: string;

  @ApiProperty({ enum: ['SECURITY_NOT_FOUND', 'NO_HISTORICAL_BARS'] })
  code!: BacktestTargetIssueCode;
}
