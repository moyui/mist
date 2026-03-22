import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsArray } from 'class-validator';

export enum SourceType {
  AKTOOLS = 'aktools',
  OTHER = 'other',
}

export class SourceConfig {
  @ApiProperty({ description: 'Source type', enum: SourceType })
  @IsEnum(SourceType)
  type!: SourceType;

  @ApiProperty({
    description: 'Source-specific configuration',
    required: false,
  })
  @IsString()
  config!: string;
}

export class AddSourceDto {
  @ApiProperty({ description: 'Stock code' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Source configuration', type: SourceConfig })
  source!: SourceConfig;

  @ApiProperty({ description: 'Supported periods (minutes)', required: false })
  @IsArray()
  periods!: number[];
}
