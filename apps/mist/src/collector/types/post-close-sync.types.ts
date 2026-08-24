import { DataSource, Period } from '@app/shared-data';

export enum DataFreshnessStatus {
  READY = 'READY',
  NOT_LATEST = 'NOT_LATEST',
  INCOMPLETE_BARS = 'INCOMPLETE_BARS',
  SUSPENDED = 'SUSPENDED',
}

export interface FreshnessValidationResult {
  status: DataFreshnessStatus;
  barCount: number;
  expectedBarCount: number;
  latestBarTime?: string;
  reason?: string;
}

export interface SyncPostCloseCriteria {
  targetDate?: Date;
  periods?: Period[];
  securityCodes?: string[];
  sourceOverride?: DataSource;
  concurrencyLimit?: number;
  window?: 'nightly_2230' | 'morning_0630' | 'manual';
}

export interface SecuritySyncTaskResult {
  securityCode: string;
  period: Period;
  source: DataSource;
  success: boolean;
  freshnessStatus: DataFreshnessStatus;
  count: number;
  error?: string;
}

export interface PostCloseSyncReport {
  targetDate: string;
  window: string;
  totalSecurities: number;
  totalTasks: number;
  succeededTasks: number;
  notReadyTasks: number;
  failedTasks: number;
  totalKLinesSaved: number;
  durationMs: number;
  details: SecuritySyncTaskResult[];
}
