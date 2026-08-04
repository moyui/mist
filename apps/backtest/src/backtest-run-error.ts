import type { BacktestTargetIssue } from '@app/shared-data';

export type BacktestFailureCode =
  | 'BACKTEST_SOURCE_UNSUPPORTED'
  | 'BACKTEST_TARGET_UNIVERSE_EMPTY'
  | 'BACKTEST_NO_EXECUTABLE_TARGETS'
  | 'BACKTEST_DATABASE_ERROR'
  | 'BACKTEST_EXECUTION_TIMEOUT'
  | 'BACKTEST_BAR_LIMIT_EXCEEDED'
  | 'BACKTEST_QUANTITY_PROFILE_UNAVAILABLE'
  | 'BACKTEST_EXECUTION_FAILED'
  | 'BACKTEST_INTERRUPTED'
  | 'BACKTEST_STARTUP_QUEUE_FULL'
  | 'BACKTEST_STARTUP_UNAVAILABLE';

export class BacktestRunFailure extends Error {
  constructor(
    readonly code: BacktestFailureCode,
    message = code,
    cause?: unknown,
    readonly targetIssues?: readonly BacktestTargetIssue[],
  ) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
    this.name = BacktestRunFailure.name;
  }
}
