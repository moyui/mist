import {
  IsNotEmpty,
  IsEnum,
  IsDate,
  IsDecimal,
  IsOptional,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Period, DataSource } from '@app/shared-data';

export class SaveMarketDataDto {
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
  @IsEnum(Period, {
    message: '周期只能是 1min、5min、15min、30min、60min 或 daily',
  })
  period!: Period;

  @IsNotEmpty({
    message: '时间戳不能为空',
  })
  @Type(() => Date)
  @IsDate({
    message: '时间戳必须是有效的日期格式',
  })
  timestamp!: Date;

  @IsNotEmpty({
    message: '开盘价不能为空',
  })
  @IsDecimal(
    {},
    {
      message: '开盘价必须是有效的数字',
    },
  )
  @Min(0, {
    message: '开盘价不能为负数',
  })
  open!: number;

  @IsNotEmpty({
    message: '最高价不能为空',
  })
  @IsDecimal(
    {},
    {
      message: '最高价必须是有效的数字',
    },
  )
  @Min(0, {
    message: '最高价不能为负数',
  })
  high!: number;

  @IsNotEmpty({
    message: '最低价不能为空',
  })
  @IsDecimal(
    {},
    {
      message: '最低价必须是有效的数字',
    },
  )
  @Min(0, {
    message: '最低价不能为负数',
  })
  low!: number;

  @IsNotEmpty({
    message: '收盘价不能为空',
  })
  @IsDecimal(
    {},
    {
      message: '收盘价必须是有效的数字',
    },
  )
  @Min(0, {
    message: '收盘价不能为负数',
  })
  close!: number;

  @IsNotEmpty({
    message: '成交量不能为空',
  })
  @IsNumber(
    {},
    {
      message: '成交量必须是有效的数字',
    },
  )
  @Min(0, {
    message: '成交量不能为负数',
  })
  volume!: bigint;

  @IsNotEmpty({
    message: '成交额不能为空',
  })
  @IsDecimal(
    {},
    {
      message: '成交额必须是有效的数字',
    },
  )
  @Min(0, {
    message: '成交额不能为负数',
  })
  amount!: number;

  @IsOptional()
  precision?: number = 0;

  @IsOptional()
  factor?: number = 1;
}
