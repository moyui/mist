import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class GetVisualCommandsDto {
  @ApiProperty({
    description: '证券代码，例如 000001、600519',
    example: '000001',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'K线周期（分钟数），例如 5, 30, 1440',
    enum: Period,
    example: Period.FIVE_MIN,
  })
  @Type(() => Number)
  @IsEnum(Period)
  period: Period;

  @ApiPropertyOptional({
    description: '数据源',
    enum: DataSource,
    example: DataSource.QMT,
  })
  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;

  @ApiPropertyOptional({
    description: '需要渲染的图层（逗号分隔，如 chan,chan_bi,chan_zs,backtest）',
    example: 'chan',
  })
  @IsOptional()
  @IsString()
  layers?: string;

  @ApiPropertyOptional({
    description: '起始时间（ISO 字符串）',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: '结束时间（ISO 字符串）',
    example: '2026-08-27T15:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: '最大K线根数（默认 500）',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  count?: number;
}
