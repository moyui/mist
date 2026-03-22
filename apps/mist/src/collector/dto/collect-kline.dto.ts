import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
} from 'class-validator';
import { Period } from '../../chan/enums/period.enum';

export class CollectKLineDto {
  @ApiProperty({
    description: 'Stock code (e.g., 000001.SH, 399006.SZ)',
    example: '000001.SH',
  })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({
    description: 'K-line period',
    enum: Period,
    example: Period.One,
  })
  @IsNotEmpty()
  @IsEnum(Period)
  period!: Period;

  @ApiProperty({
    description: 'Start date for data collection',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description:
      'End date for data collection (optional, defaults to current time)',
    example: '2024-01-31T23:59:59.999Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class CollectKLineResponse {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiProperty({ description: 'Response code' })
  code!: number;

  @ApiProperty({ description: 'Response message' })
  message!: string;

  @ApiProperty({ description: 'Number of records collected' })
  recordCount!: number;

  @ApiProperty({ description: 'Collection status information' })
  data!: {
    hasData: boolean;
    recordCount: number;
    lastRecord?: Date;
    firstRecord?: Date;
  };

  @ApiProperty({ description: 'Timestamp' })
  timestamp!: string;

  @ApiProperty({ description: 'Request ID' })
  requestId!: string;
}
