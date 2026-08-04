import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Matches,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class CreateBacktestRunDto {
  @ApiProperty({ description: 'Strategy version to replay' })
  @IsInt()
  strategyVersionId!: number;

  @ApiProperty({ description: 'Canonical security codes to replay' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9._-]{1,20}$/, { each: true })
  targetUniverse!: string[];

  @ApiProperty({ description: 'Replay period', enum: Period })
  @IsEnum(Period)
  period!: Period;

  @ApiProperty({
    description: 'Replay data source',
    enum: [DataSource.TDX, DataSource.QMT],
  })
  @IsIn([DataSource.TDX, DataSource.QMT])
  source!: DataSource.TDX | DataSource.QMT;

  @ApiProperty({ description: 'Inclusive replay start date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'Inclusive replay end date' })
  @IsDateString()
  endDate!: string;
}
