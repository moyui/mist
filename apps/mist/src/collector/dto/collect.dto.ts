import { IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Period, DataSource } from '@app/shared-data';

export class CollectDto {
  @ApiProperty({ description: '证券代码', example: '000001' })
  @IsNotEmpty({ message: '证券代码不能为空' })
  code!: string;

  @ApiProperty({
    description: 'K线周期',
    enum: Period,
    example: Period.FIVE_MIN,
  })
  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.keys(Period)
      .filter((k) => isNaN(Number(k)))
      .join(', ')}`,
  })
  period!: Period;

  @ApiProperty({
    description: '开始时间',
    example: '2026-03-30T09:30:00+08:00',
  })
  @IsNotEmpty({ message: '开始时间不能为空' })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({
    description: '结束时间',
    example: '2026-03-30T11:30:00+08:00',
  })
  @IsNotEmpty({ message: '结束时间不能为空' })
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({
    description: '数据源',
    enum: DataSource,
    example: DataSource.EAST_MONEY,
  })
  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.keys(DataSource)
      .filter((k) => isNaN(Number(k)))
      .join(', ')}`,
  })
  source?: DataSource;
}
