import { Decimal8 } from '@app/decimal';
import { fromZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE, formatTradingDayString } from '@app/timezone';

export type RealtimeCandleSource = 'tdx' | 'qmt';

export interface RealtimeClosedCandleRecordV1 {
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: string | null;
  readonly a: string | null;
  readonly cv: string | null;
  readonly ca: string | null;
  readonly cs: object | null;
  readonly fe: string;
  readonly le: string;
  readonly q: 'provisional';
}

export const REALTIME_MARKET_REDIS_NAMESPACE = 'mist:realtime:v1';
export const REALTIME_REDIS_RECORD_LIMITS = {
  sealed: 2_048,
  dueMember: 128,
  manifest: 1_024,
} as const;
export const REALTIME_REDIS_RANGE_BATCH_SIZE = 64;

export function closedCandleKey(
  tradingDay: string,
  source: RealtimeCandleSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:candle:1m:closed`;
}

export function watermarkKey(
  tradingDay: string,
  source: RealtimeCandleSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:candle:1m:watermark`;
}

export function manifestKey(
  tradingDay: string,
  source: RealtimeCandleSource,
  securityId: number,
): string {
  return `${marketSeriesPartition(tradingDay, source, securityId)}:manifest`;
}

export function dueKey(tradingDay: string): string {
  assertTradingDay(tradingDay);
  return `${REALTIME_MARKET_REDIS_NAMESPACE}:day:${tradingDay}:candle:1m:due`;
}

export function marketDayExpiryEpochSeconds(tradingDay: string): number {
  assertTradingDay(tradingDay);
  const wallMidnight = `${tradingDay.slice(0, 4)}-${tradingDay.slice(4, 6)}-${tradingDay.slice(6, 8)}T00:00:00.000`;
  const start = fromZonedTime(wallMidnight, ASIA_SHANGHAI_TIMEZONE).getTime();
  if (!Number.isFinite(start)) throw new RangeError('tradingDay is invalid');
  const roundTrip = formatTradingDayString(start);
  if (roundTrip !== tradingDay) throw new RangeError('tradingDay is invalid');
  return Math.floor((start + 24 * 60 * 60_000) / 1_000);
}

export function encodeDueMember(
  securityId: number,
  source: RealtimeCandleSource,
  bucketStartMs: number,
): string {
  assertSecurityId(securityId);
  assertBucketStartMs(bucketStartMs);
  const member = `${securityId}:${source}:${bucketStartMs}`;
  assertRealtimeRedisBytes(
    'due member',
    member,
    REALTIME_REDIS_RECORD_LIMITS.dueMember,
  );
  return member;
}

export function decodeDueMember(member: string): {
  securityId: number;
  source: RealtimeCandleSource;
  bucketStartMs: number;
} {
  assertRealtimeRedisBytes(
    'due member',
    member,
    REALTIME_REDIS_RECORD_LIMITS.dueMember,
  );
  const parts = member.split(':');
  if (parts.length !== 3) {
    throw new RangeError('due member must contain exactly three fields');
  }
  const [securityIdText, source, ms] = parts;
  const securityId = Number(securityIdText);
  const bucketStartMs = Number(ms);
  assertSecurityId(securityId);
  assertSource(source);
  assertBucketStartMs(bucketStartMs);
  return { securityId, source, bucketStartMs };
}

export function decodeRealtimeClosedCandleRecordV1(
  value: unknown,
): RealtimeClosedCandleRecordV1 {
  if (!isRecord(value) || !hasExactKeys(value, CLOSED_RECORD_FIELDS)) {
    throw new TypeError('Invalid realtime closed-candle record');
  }
  for (const field of ['o', 'h', 'l', 'c'] as const) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      throw new TypeError(`closed-candle ${field} must be finite`);
    }
  }
  for (const field of ['v', 'a', 'cv', 'ca'] as const) {
    assertCanonicalDecimalOrNull(value[field], field);
  }
  if (value.cs !== null && !isRecord(value.cs)) {
    throw new TypeError('closed-candle cs must be an object or null');
  }
  if (
    !isRfc3339(value.fe) ||
    !isRfc3339(value.le) ||
    value.q !== 'provisional'
  ) {
    throw new TypeError('Invalid closed-candle metadata');
  }
  return value as unknown as RealtimeClosedCandleRecordV1;
}

export function assertRealtimeRedisBytes(
  label: string,
  value: string,
  maximum: number,
): void {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maximum) {
    throw new RangeError(
      `${label} is ${bytes} UTF-8 bytes; maximum is ${maximum}`,
    );
  }
}

const CLOSED_RECORD_FIELDS = [
  'o',
  'h',
  'l',
  'c',
  'v',
  'a',
  'cv',
  'ca',
  'cs',
  'fe',
  'le',
  'q',
] as const;

function marketSeriesPartition(
  tradingDay: string,
  source: RealtimeCandleSource,
  securityId: number,
): string {
  assertTradingDay(tradingDay);
  assertSource(source);
  assertSecurityId(securityId);
  return `${REALTIME_MARKET_REDIS_NAMESPACE}:day:${tradingDay}:${source}:${securityId}`;
}

function assertTradingDay(value: string): void {
  if (!/^\d{8}$/.test(value)) {
    throw new RangeError('tradingDay must use YYYYMMDD');
  }
}

function assertSource(value: unknown): asserts value is RealtimeCandleSource {
  if (value !== 'tdx' && value !== 'qmt') {
    throw new RangeError('realtime candle source must be tdx or qmt');
  }
}

function assertSecurityId(securityId: number): void {
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new RangeError('securityId must be a positive safe integer');
  }
}

function assertBucketStartMs(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('bucketStartMs must be a positive safe integer');
  }
}

function assertCanonicalDecimalOrNull(value: unknown, field: string): void {
  if (value === null) return;
  if (typeof value !== 'string') {
    throw new TypeError(`closed-candle ${field} must be a string or null`);
  }
  Decimal8.parseCanonical(value);
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}
