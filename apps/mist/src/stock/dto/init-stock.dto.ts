import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum StockType {
  INDEX = 'index',
  STOCK = 'stock',
}

export enum SourceType {
  AKTOOLS = 'aktools',
  OTHER = 'other',
}

export class SourceConfig {
  @ApiProperty({ description: 'Source type', enum: SourceType })
  @IsEnum(SourceType)
  type: SourceType;

  @ApiProperty({ description: 'Source-specific configuration', required: false })
  @IsString()
  config?: string;
}

export class InitStockDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty({ description: 'Stock name', required: false })
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Stock type', enum: StockType })
  @IsEnum(StockType)
  type: StockType;

  @ApiProperty({ description: 'Supported periods (minutes)', required: false })
  @IsArray()
  @IsNumber({}, { each: true })
  periods?: number[];

  @ApiProperty({ description: 'Source configuration', type: () => SourceConfig })
  @ValidateNested()
  @Type(() => SourceConfig)
  source: SourceConfig;
}