import { ApiProperty } from '@nestjs/swagger';
import { REALTIME_SUBSCRIPTION_SOURCES } from '../realtime-subscription.constants';
import type { RealtimeSubscriptionSource } from '../realtime-subscription.constants';

export class RealtimeSourceLockedDataVo {
  @ApiProperty({ minimum: 1 })
  assignmentId!: number;

  @ApiProperty({ minimum: 1 })
  securityId!: number;

  @ApiProperty({ minimum: 1 })
  securitySourceConfigId!: number;
}

export class RealtimeActiveCapacityDataVo {
  @ApiProperty({ enum: REALTIME_SUBSCRIPTION_SOURCES })
  source!: RealtimeSubscriptionSource;

  @ApiProperty({ minimum: 0 })
  activeAssignmentCount!: number;

  @ApiProperty({ enum: [5] })
  limit!: 5;
}

export class RealtimeAssignmentExistsDataVo {
  @ApiProperty({ minimum: 1 })
  assignmentId!: number;

  @ApiProperty({ minimum: 1 })
  securityId!: number;
}

export class RealtimeSecurityExistsDataVo {
  @ApiProperty({ minimum: 1 })
  securityId!: number;

  @ApiProperty({ pattern: '^[0-9]{6}$' })
  securityCode!: string;
}

export class RealtimeSourceConfigNotFoundDataVo {
  @ApiProperty({ minimum: 1 })
  securitySourceConfigId!: number;
}

export const REALTIME_SECURITY_INELIGIBLE_REASONS = [
  'security_not_active',
  'security_not_stock',
] as const;

export class RealtimeSecurityNotEligibleDataVo {
  @ApiProperty({ minimum: 1 })
  securityId!: number;

  @ApiProperty({ enum: REALTIME_SECURITY_INELIGIBLE_REASONS })
  reason!: (typeof REALTIME_SECURITY_INELIGIBLE_REASONS)[number];
}

export const REALTIME_SOURCE_CONFIG_INELIGIBLE_REASONS = [
  'source_not_realtime',
  'source_disabled',
  'provider_symbol_invalid',
] as const;

export class RealtimeSourceConfigNotEligibleDataVo {
  @ApiProperty({ minimum: 1 })
  securitySourceConfigId!: number;

  @ApiProperty({ enum: REALTIME_SOURCE_CONFIG_INELIGIBLE_REASONS })
  reason!: (typeof REALTIME_SOURCE_CONFIG_INELIGIBLE_REASONS)[number];
}
