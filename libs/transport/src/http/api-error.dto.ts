import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto<TCode extends string = string, TData = never> {
  @ApiProperty({ example: false, enum: [false] })
  success!: false;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'BAD_REQUEST' })
  code!: TCode;

  @ApiProperty({ example: 'Bad Request' })
  message!: string;

  @ApiPropertyOptional()
  data?: TData;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  errors?: Record<string, string[]>;

  @ApiProperty({ example: '2026-08-03T03:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'http-2fc2f348-2f67-4e78-9899-bbfdb9c8d123' })
  requestId!: string;

  @ApiProperty({ example: '/v1/securities' })
  path!: string;
}
