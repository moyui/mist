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

export class AddSecuritySourceDto {
  @ApiProperty({
    description:
      'Canonical security code. Provider-formatted inputs are normalized.',
    example: '600519',
  })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Data source', enum: DataSource })
  @IsEnum(DataSource)
  source!: DataSource;

  @ApiProperty({
    description:
      'Provider-specific transport code. Required when enabled; TDX/QMT use 600519.SH form.',
    example: '600519.SH',
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
