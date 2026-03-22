import { DataSource, KPeriod } from '@app/shared-data';
import { IsEnum, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

/**
 * Unified query DTO for K-line endpoints
 * Supports optional data source selection
 */
export class KlineQueryDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol!: string;

  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.values(DataSource).join(', ')}`,
  })
  source?: DataSource;

  @IsEnum(KPeriod, {
    message:
      '周期只能为1min, 5min, 15min, 30min, 60min, daily，其中 1 分钟数据只能返回当前的, 其余只能返回近期的数据',
  })
  period!: KPeriod;

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
