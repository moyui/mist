import { ApiProperty } from '@nestjs/swagger';
import { SecurityType } from '@app/shared-data';
import { REALTIME_SUBSCRIPTION_SOURCES } from '../realtime-subscription.constants';
import type { RealtimeSubscriptionSource } from '../realtime-subscription.constants';

export const REALTIME_SECURITY_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'DELISTED',
] as const;
export type RealtimeSecurityStatus =
  (typeof REALTIME_SECURITY_STATUSES)[number];

export const REALTIME_ACTIVE_EVIDENCE = [
  'tdx_native_list',
  'qmt_durable_registry',
] as const;
export type RealtimeActiveEvidence = (typeof REALTIME_ACTIVE_EVIDENCE)[number];

export const REALTIME_CONVERGENCE = [
  'converged',
  'pending',
  'drifted',
  'blocked',
  'unknown',
] as const;
export type RealtimeConvergence = (typeof REALTIME_CONVERGENCE)[number];

export const REALTIME_CONVERGENCE_REASONS = [
  'lifecycle_disabled',
  'transport_not_ready',
  'readback_stale',
  'control_outcome_unknown',
  'desired_missing_active',
  'awaiting_full_reset',
  'control_failed',
  'qmt_reconciliation_required',
  'qmt_journal_unhealthy',
  'source_capacity_blocked',
] as const;
export type RealtimeConvergenceReason =
  (typeof REALTIME_CONVERGENCE_REASONS)[number];

export class RealtimeSubscriptionVo {
  @ApiProperty({ minimum: 1 })
  assignmentId!: number;

  @ApiProperty({ minimum: 1 })
  securityId!: number;

  @ApiProperty({ minimum: 1 })
  securitySourceConfigId!: number;

  @ApiProperty({ pattern: '^[0-9]{6}$' })
  securityCode!: string;

  @ApiProperty()
  securityName!: string;

  @ApiProperty({ enum: SecurityType })
  securityType!: SecurityType;

  @ApiProperty({ enum: REALTIME_SECURITY_STATUSES })
  securityStatus!: RealtimeSecurityStatus;

  @ApiProperty({ enum: REALTIME_SUBSCRIPTION_SOURCES })
  source!: RealtimeSubscriptionSource;

  @ApiProperty({ pattern: '^[0-9]{6}\\.(SH|SZ|BJ)$' })
  providerSymbol!: string;

  @ApiProperty()
  desired!: boolean;

  @ApiProperty({ type: Boolean, nullable: true })
  active!: boolean | null;

  @ApiProperty({ enum: REALTIME_ACTIVE_EVIDENCE, nullable: true })
  activeEvidence!: RealtimeActiveEvidence | null;

  @ApiProperty({ enum: REALTIME_CONVERGENCE })
  convergence!: RealtimeConvergence;

  @ApiProperty({ enum: REALTIME_CONVERGENCE_REASONS, nullable: true })
  convergenceReason!: RealtimeConvergenceReason | null;

  @ApiProperty({ enum: ['awaiting_full_reset'], nullable: true })
  deferredRemovalReason!: 'awaiting_full_reset' | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class RealtimeSourceCapacityVo {
  @ApiProperty({ enum: REALTIME_SUBSCRIPTION_SOURCES })
  source!: RealtimeSubscriptionSource;

  @ApiProperty({ minimum: 0 })
  activeAssignmentCount!: number;

  @ApiProperty({ enum: [5] })
  limit!: 5;
}

export class RealtimeSubscriptionPageVo {
  @ApiProperty({ type: RealtimeSubscriptionVo, isArray: true, maxItems: 100 })
  items!: RealtimeSubscriptionVo[];

  @ApiProperty({ type: Number, nullable: true, minimum: 1 })
  nextAfterId!: number | null;

  @ApiProperty({ type: RealtimeSourceCapacityVo, isArray: true })
  sourceCapacities!: RealtimeSourceCapacityVo[];
}
