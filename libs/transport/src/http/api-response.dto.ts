import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 'SUCCESS' })
  message!: string;

  @ApiProperty({ nullable: true })
  data!: T;

  @ApiProperty({ example: '2026-08-03T03:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'http-2fc2f348-2f67-4e78-9899-bbfdb9c8d123' })
  requestId!: string;

  @ApiProperty({ example: '/v1/securities' })
  path!: string;
}
