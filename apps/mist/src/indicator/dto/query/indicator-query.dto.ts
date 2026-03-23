import { DataSource, Period } from '@app/shared-data';
import { IsEnum, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

/**
 * Unified query DTO for all indicator endpoints
 * Supports optional data source selection
 */
export class IndicatorQueryDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
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

  @IsNotEmpty({
    message: '开始日期不能为空，格式为13位时间戳',
  })
  @IsNumber(
    {},
    {
      message: '开始日期必须是13位时间戳数字',
    },
  )
  startDate!: number;

  @IsNotEmpty({
    message: '结束日期不能为空，格式为13位时间戳',
  })
  @IsNumber(
    {},
    {
      message: '结束日期必须是13位时间戳数字',
    },
  )
  endDate!: number;
}
