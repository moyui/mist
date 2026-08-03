import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class QueryStrategySignalDto {
  @IsOptional()
  @IsString()
  strategyDefinitionId?: string;

  @IsOptional()
  @IsString()
  securityId?: string;

  @IsOptional()
  @IsEnum(Period)
  period?: Period;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;
}
