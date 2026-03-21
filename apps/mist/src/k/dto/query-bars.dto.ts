import { IsEnum, IsNotEmpty, IsDateString } from 'class-validator';
import { KPeriod } from '@app/shared-data';

export class QueryBarsDto {
  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  @IsEnum(KPeriod)
  period: KPeriod;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
