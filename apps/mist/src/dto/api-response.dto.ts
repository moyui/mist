import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'SUCCESS' })
  message!: string;

  @ApiProperty({ required: false })
  data!: T;

  @ApiProperty({ example: '2026-03-19T10:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'http-1710819800000-abc123xyz' })
  requestId!: string;
}

export class ApiErrorDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ example: 1001 })
  code!: number;

  @ApiProperty({ example: 'INVALID_PARAMETER' })
  message!: string;

  @ApiProperty({ example: '2026-03-19T10:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'err-1710819800000-def456uvw' })
  requestId!: string;
}
