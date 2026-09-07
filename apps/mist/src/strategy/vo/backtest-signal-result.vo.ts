import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BacktestSignalResultVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  backtestRunId!: number;
  @ApiProperty()
  securityCode!: string;
  @ApiProperty()
  signalTime!: string;
  @ApiPropertyOptional({ description: '决策流综合置信度得分 (0~100)' })
  confidence?: number | null;
  @ApiPropertyOptional({
    description: '置信度分级',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
  })
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  @ApiPropertyOptional({
    description: '白盒决策推导轨迹与证据快照',
    type: 'object',
    additionalProperties: true,
  })
  decisionTrace?: Record<string, unknown> | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  contextSnapshot!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  ruleSnapshot!: Record<string, unknown>;
  @ApiProperty()
  createdAt!: string;
}
