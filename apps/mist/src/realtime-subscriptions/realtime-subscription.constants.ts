import { DataSource } from '@app/shared-data';

export const REALTIME_SUBSCRIPTION_SOURCES = [
  DataSource.TDX,
  DataSource.QMT,
] as const;

export type RealtimeSubscriptionSource =
  (typeof REALTIME_SUBSCRIPTION_SOURCES)[number];

export const REALTIME_ACTIVE_CAPACITY_LIMIT = 5;

export const REALTIME_ASSIGNMENT_SECURITY_UNIQUE =
  'uq_realtime_subscription_assignments_security';
export const REALTIME_ASSIGNMENT_SOURCE_CONFIG_UNIQUE =
  'uq_realtime_subscription_assignments_source_config';
export const SECURITY_CODE_UNIQUE = 'uq_securities_code';

export const REALTIME_SUBSCRIPTION_BUSINESS_CODES = [
  'REALTIME_SOURCE_LOCKED',
  'REALTIME_ACTIVE_CAPACITY_REACHED',
  'REALTIME_ASSIGNMENT_EXISTS',
  'REALTIME_SECURITY_EXISTS',
  'REALTIME_SOURCE_CONFIG_NOT_FOUND',
  'REALTIME_SECURITY_NOT_ELIGIBLE',
  'REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE',
] as const;
