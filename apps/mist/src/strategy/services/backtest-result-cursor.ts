export interface BacktestResultCursor {
  readonly runId: number;
  readonly signalTime: Date;
  readonly id: number;
}

const CURSOR_KEYS = ['id', 'runId', 'signalTime', 'v'] as const;

export function encodeBacktestResultCursor(
  cursor: BacktestResultCursor,
): string {
  const payload = JSON.stringify({
    v: 1,
    runId: cursor.runId,
    signalTime: cursor.signalTime.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeBacktestResultCursor(
  value: string,
  expectedRunId: number,
): BacktestResultCursor {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.includes('=') ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new TypeError('invalid backtest result cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new TypeError('invalid backtest result cursor');
  }
  if (!isRecord(parsed) || !sameKeys(Object.keys(parsed), CURSOR_KEYS)) {
    throw new TypeError('invalid backtest result cursor');
  }
  const record = parsed as {
    v: unknown;
    runId: unknown;
    signalTime: unknown;
    id: unknown;
  };
  if (record.v !== 1 || record.runId !== expectedRunId) {
    throw new TypeError('invalid backtest result cursor');
  }
  if (
    !Number.isSafeInteger(record.runId) ||
    (record.runId as number) <= 0 ||
    !Number.isSafeInteger(record.id) ||
    (record.id as number) <= 0 ||
    typeof record.signalTime !== 'string'
  ) {
    throw new TypeError('invalid backtest result cursor');
  }
  const signalTime = new Date(record.signalTime);
  if (
    !Number.isFinite(signalTime.getTime()) ||
    signalTime.toISOString() !== record.signalTime
  ) {
    throw new TypeError('invalid backtest result cursor');
  }
  return {
    runId: record.runId as number,
    signalTime,
    id: record.id as number,
  };
}

function sameKeys(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((key, index) => key === expected[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
