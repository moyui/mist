import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { DataSource, SecurityType } from '@app/shared-data';
import { REALTIME_SUBSCRIPTION_SOURCES } from '../realtime-subscription.constants';

export type RealtimeSubscriptionInitializationMode = 'new' | 'existing';

export class NewRealtimeSubscriptionDto {
  @ApiProperty({ enum: ['new'] })
  mode!: 'new';

  @ApiProperty({ pattern: '^[0-9]{6}$', example: '600519' })
  securityCode!: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: '贵州茅台' })
  securityName!: string;

  @ApiProperty({ enum: [SecurityType.STOCK, SecurityType.INDEX] })
  securityType!: SecurityType;

  @ApiProperty({ enum: REALTIME_SUBSCRIPTION_SOURCES })
  source!: DataSource.TDX | DataSource.QMT;

  @ApiProperty({
    pattern: '^[0-9]{6}\\.(SH|SZ|BJ)$',
    example: '600519.SH',
  })
  providerSymbol!: string;
}

export class ExistingRealtimeSubscriptionDto {
  @ApiProperty({ enum: ['existing'] })
  mode!: 'existing';

  @ApiProperty({ minimum: 1 })
  securitySourceConfigId!: number;
}

@ValidatorConstraint({ name: 'realtimeSubscriptionInitializationShape' })
class RealtimeSubscriptionInitializationShapeConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const input = args.object as InitializeRealtimeSubscriptionDto;
    if (input.mode === 'new') {
      return (
        typeof input.securityCode === 'string' &&
        typeof input.securityName === 'string' &&
        (input.securityType === SecurityType.STOCK ||
          input.securityType === SecurityType.INDEX) &&
        REALTIME_SUBSCRIPTION_SOURCES.includes(
          input.source as (typeof REALTIME_SUBSCRIPTION_SOURCES)[number],
        ) &&
        typeof input.providerSymbol === 'string' &&
        input.securitySourceConfigId === undefined
      );
    }
    if (input.mode === 'existing') {
      return (
        Number.isInteger(input.securitySourceConfigId) &&
        input.securityCode === undefined &&
        input.securityName === undefined &&
        input.securityType === undefined &&
        input.source === undefined &&
        input.providerSymbol === undefined
      );
    }
    return false;
  }

  defaultMessage(): string {
    return 'mode must select exactly the new or existing initialization fields';
  }
}

export class InitializeRealtimeSubscriptionDto {
  @ApiProperty({ enum: ['new', 'existing'] })
  @IsIn(['new', 'existing'])
  @Validate(RealtimeSubscriptionInitializationShapeConstraint)
  mode!: RealtimeSubscriptionInitializationMode;

  @ApiPropertyOptional({ pattern: '^[0-9]{6}$', example: '600519' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/)
  securityCode?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100, example: '贵州茅台' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  securityName?: string;

  @ApiPropertyOptional({ enum: [SecurityType.STOCK, SecurityType.INDEX] })
  @IsOptional()
  @IsIn([SecurityType.STOCK, SecurityType.INDEX])
  securityType?: SecurityType;

  @ApiPropertyOptional({ enum: REALTIME_SUBSCRIPTION_SOURCES })
  @IsOptional()
  @IsIn(REALTIME_SUBSCRIPTION_SOURCES)
  source?: DataSource.TDX | DataSource.QMT;

  @ApiPropertyOptional({
    pattern: '^[0-9]{6}\\.(SH|SZ|BJ)$',
    example: '600519.SH',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}\.(SH|SZ|BJ)$/)
  providerSymbol?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  securitySourceConfigId?: number;
}
