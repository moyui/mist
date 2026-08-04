export const BACKTEST_RUN_SUBMIT_PATTERN = 'backtest.run.submit.v1' as const;

export interface SubmitBacktestRunCommandV1 {
  readonly runId: number;
}

export type SubmitBacktestRunErrorCode =
  | 'queue_full'
  | 'not_ready'
  | 'run_failed';

export function decodeSubmitBacktestRunCommandV1(
  value: unknown,
): SubmitBacktestRunCommandV1 {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.runId) ||
    (value.runId as number) <= 0
  ) {
    throw new TypeError('runId must be a positive safe integer');
  }
  return { runId: value.runId as number };
}

export function decodeSubmitBacktestRunSuccessV1(value: unknown): null {
  if (value !== null) {
    throw new TypeError('backtest RPC success data must be null');
  }
  return null;
}

export function decodeSubmitBacktestRunErrorCodeV1(
  value: unknown,
): SubmitBacktestRunErrorCode {
  if (
    value !== 'queue_full' &&
    value !== 'not_ready' &&
    value !== 'run_failed'
  ) {
    throw new TypeError('unsupported backtest RPC rejection code');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
