import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';
import { BacktestTargetIssueVo } from './backtest-target-issue.vo';

export class BacktestRunVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  strategyDefinitionId!: number;
  @ApiProperty()
  strategyVersionId!: number;
  @ApiProperty({ type: [String] })
  targetUniverse!: string[];
  @ApiProperty({ enum: Period })
  period!: Period;
  @ApiProperty({ enum: DataSource })
  source!: DataSource;
  @ApiProperty()
  startDate!: string;
  @ApiProperty()
  endDate!: string;
  @ApiProperty({ enum: BacktestRunStatus })
  status!: BacktestRunStatus;
  @ApiProperty()
  signalCount!: number;
  @ApiProperty()
  matchedSecurityCount!: number;
  @ApiProperty({ type: [BacktestTargetIssueVo] })
  targetIssues!: BacktestTargetIssueVo[];
  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;
}
