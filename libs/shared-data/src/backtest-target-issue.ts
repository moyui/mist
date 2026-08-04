export type BacktestTargetIssueCode =
  | 'SECURITY_NOT_FOUND'
  | 'NO_HISTORICAL_BARS';

export interface BacktestTargetIssue {
  readonly securityCode: string;
  readonly code: BacktestTargetIssueCode;
}
