import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class DeleteSecuritySourceDto {
  @ApiProperty({ description: 'SecuritySourceConfig ID' })
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  @ApiProperty({ description: 'Security ID' })
  @IsNotEmpty()
  @IsNumber()
  securityId!: number;
}
