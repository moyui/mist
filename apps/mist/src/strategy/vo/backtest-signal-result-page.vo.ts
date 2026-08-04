import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BacktestSignalResultVo } from './backtest-signal-result.vo';

export class BacktestSignalResultPageVo {
  @ApiProperty({ type: [BacktestSignalResultVo] })
  items!: BacktestSignalResultVo[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}
