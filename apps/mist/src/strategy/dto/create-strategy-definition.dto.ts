import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { DataSource, Period, StrategySignalKind } from '@app/shared-data';

export class CreateStrategyDefinitionDto {
  @ApiProperty({ description: 'Strategy display name' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Strategy description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Canonical security codes to evaluate' })
  @IsArray()
  @IsString({ each: true })
  targetUniverse!: string[];

  @ApiProperty({
    description: 'Supported periods',
    enum: Period,
    isArray: true,
  })
  @IsArray()
  @IsEnum(Period, { each: true })
  periods!: Period[];

  @ApiProperty({
    description: 'Supported data sources',
    enum: DataSource,
    isArray: true,
  })
  @IsArray()
  @IsEnum(DataSource, { each: true })
  sources!: DataSource[];

  @ApiProperty({ description: 'Declarative rule expression' })
  @IsObject()
  rule!: Record<string, unknown>;

  @ApiProperty({ description: 'Signal intent', enum: StrategySignalKind })
  @IsEnum(StrategySignalKind)
  signalKind!: StrategySignalKind;
}
