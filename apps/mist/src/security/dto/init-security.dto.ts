import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { SecurityType } from '@app/shared-data';

export class InitSecurityDto {
  @ApiProperty({ description: 'Security code (e.g., 000001.SH, 399006.SZ)' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Security name', required: false })
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Security type', enum: SecurityType })
  @IsEnum(SecurityType)
  type!: SecurityType;
}
