import {
  IsNotEmpty,
  IsEnum,
  IsDate,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KPeriod, DataSource } from '@app/shared-data';

export class QueryMarketDataDto {
  @IsNotEmpty({
    message: '证券代码不能为空',
  })
  code!: string;

  @IsNotEmpty({
    message: '数据源不能为空',
  })
  @IsEnum(DataSource, {
    message: '数据源只能是 ef、tdx 或 mqmt',
  })
  source!: DataSource;

  @IsNotEmpty({
    message: '周期不能为空',
  })
  @IsEnum(KPeriod, {
    message: '周期只能是 1min、5min、15min、30min、60min 或 daily',
  })
  period!: KPeriod;

  @IsNotEmpty({
    message: '开始时间不能为空',
  })
  @Type(() => Date)
  @IsDate({
    message: '开始时间必须是有效的日期格式',
  })
  startTime!: Date;

  @IsNotEmpty({
    message: '结束时间不能为空',
  })
  @Type(() => Date)
  @IsDate({
    message: '结束时间必须是有效的日期格式',
  })
  endTime!: Date;

  @IsOptional()
  @Min(1, {
    message: '页码必须大于0',
  })
  @Max(10000, {
    message: '页码不能超过10000',
  })
  page?: number = 1;

  @IsOptional()
  @Min(1, {
    message: '每页数量必须大于0',
  })
  @Max(1000, {
    message: '每页数量不能超过1000',
  })
  pageSize?: number = 100;
}
