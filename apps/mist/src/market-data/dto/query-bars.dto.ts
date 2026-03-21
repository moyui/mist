import { IsEnum, IsNotEmpty, IsDateString } from 'class-validator';
import { BarPeriod } from '@app/shared-data';

export class QueryBarsDto {
  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  @IsEnum(BarPeriod)
  period: BarPeriod;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
