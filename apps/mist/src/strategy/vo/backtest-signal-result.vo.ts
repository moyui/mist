import { ApiProperty } from '@nestjs/swagger';

export class BacktestSignalResultVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  backtestRunId!: number;
  @ApiProperty()
  securityCode!: string;
  @ApiProperty()
  signalTime!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  contextSnapshot!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  ruleSnapshot!: Record<string, unknown>;
  @ApiProperty()
  createdAt!: string;
}
