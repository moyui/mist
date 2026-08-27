import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListBacktestRunsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by strategy definition ID',
    type: Number,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  strategyDefinitionId?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of runs to return (1-100)',
    default: 50,
    maximum: 100,
    type: Number,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
