import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { DataSource } from '@app/shared-data';

export class AddSourceDto {
  @ApiProperty({ description: 'Stock code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Data source', enum: DataSource })
  @IsEnum(DataSource)
  source!: DataSource;

  @ApiProperty({
    description: 'Data source specific code format',
    required: false,
  })
  @IsOptional()
  @IsString()
  formatCode?: string;

  @ApiProperty({
    description: 'Priority (higher = preferred)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiProperty({ description: 'Whether source is enabled', required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
