import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class BacktestRunIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  runId!: number;
}
