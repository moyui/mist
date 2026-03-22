import { DataSource } from '@app/shared-data';
import { Period } from '../../enums/period.enum';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Unified query DTO for Chan Theory endpoints
 * Supports optional data source selection and numeric period values
 */
export class ChanQueryDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  @IsString()
  symbol!: string;

  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.values(DataSource).join(', ')}`,
  })
  source?: DataSource;

  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.values(Period).join(', ')}`,
  })
  period!: Period;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
