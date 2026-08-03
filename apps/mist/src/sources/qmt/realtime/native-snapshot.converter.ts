import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime.types';
import { RealtimeQuantityValidationError } from '../../../realtime/realtime-quantity-validation.error';

export interface QmtNativeSnapshotInput {
  securityId: number;
  providerSymbol: string;
  capturedAt: string;
  native: Record<string, unknown>;
}

export function convertQmtNativeSnapshot(
  input: QmtNativeSnapshotInput,
): CanonicalRealtimeSnapshot {
  const last = requiredFiniteNumber(input.native['lastPrice'], 'lastPrice');
  const open = optionalFiniteNumber(input.native['open']);
  const high = optionalFiniteNumber(input.native['high']);
  const low = optionalFiniteNumber(input.native['low']);
  const lastClose = optionalFiniteNumber(input.native['lastClose']);
  const eventTime = resolveQmtBusinessTime(input.native);

  return {
    source: 'qmt',
    securityId: input.securityId,
    providerSymbol: input.providerSymbol,
    eventTime,
    capturedAt: input.capturedAt,
    prices: { last, open, high, low, lastClose },
    cumulativeVolume: readQmtVolume(input.native),
    cumulativeAmount: readQmtAmount(input.native),
    quality: {
      level: 'latest-state',
      eventTimeAvailable: eventTime !== null,
      aggregationEligible: eventTime !== null,
      partialPrices: [open, high, low, lastClose].some(
        (value) => value === null,
      ),
    },
    native: structuredClone(input.native),
  };
}

function readQmtVolume(native: Record<string, unknown>): string | null {
  const value = native['volume'];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number') {
    throw quantityError('volume', 'invalid_type');
  }
  if (value < 0 || Object.is(value, -0)) {
    throw quantityError('volume', 'negative_value');
  }
  if (!Number.isSafeInteger(value)) {
    throw quantityError('volume', 'unsafe_integer');
  }
  return Decimal8.parseCanonical(normalizeQmtObservableNumber(value))
    .scaleByUnit(100)
    .formatCanonical();
}

function readQmtAmount(native: Record<string, unknown>): string | null {
  const value = native['amount'];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw quantityError('amount', 'invalid_type');
  }
  if (value < 0 || Object.is(value, -0)) {
    throw quantityError('amount', 'negative_value');
  }
  let observable: string;
  try {
    observable = expandScientificNotation(value);
  } catch {
    throw quantityError('amount', 'invalid_format');
  }
  const fraction = observable.split('.')[1] ?? '';
  if (fraction.length > 8) {
    throw quantityError('amount', 'precision_exceeded');
  }
  try {
    return Decimal8.parseCanonical(
      normalizeExternalDecimalText(observable),
    ).formatCanonical();
  } catch (error) {
    throw quantityError(
      'amount',
      error instanceof RangeError ? 'out_of_range' : 'invalid_format',
    );
  }
}

function normalizeQmtObservableNumber(value: number): string {
  return normalizeExternalDecimalText(expandScientificNotation(value));
}

function quantityError(
  field: 'volume' | 'amount',
  reason: ConstructorParameters<typeof RealtimeQuantityValidationError>[2],
): RealtimeQuantityValidationError {
  return new RealtimeQuantityValidationError(
    'qmt',
    field,
    reason,
    `QMT native ${field} violates the ${reason} quantity boundary`,
  );
}

function expandScientificNotation(value: number): string {
  const observable = value.toString();
  if (!/[eE]/.test(observable)) return observable;

  const match = /^(\d)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(observable);
  if (!match) {
    throw new TypeError('QMT native number has an unsupported observable form');
  }
  const [, integer, fraction = '', exponentText] = match;
  const digits = `${integer}${fraction}`;
  const decimalPosition = 1 + Number(exponentText);
  if (decimalPosition <= 0) {
    return `0.${'0'.repeat(-decimalPosition)}${digits}`;
  }
  if (decimalPosition >= digits.length) {
    return `${digits}${'0'.repeat(decimalPosition - digits.length)}`;
  }
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

export function resolveQmtBusinessTime(
  native: Record<string, unknown>,
): string | null {
  const parsed = [
    parseNumericTimestamp(native['time']),
    parseQmtTimeString(native['stime']),
    parseQmtTimeString(native['timetag']),
  ].filter((value): value is number => value !== null);
  if (parsed.length === 0) return null;
  const first = parsed[0];
  if (parsed.some((value) => Math.abs(value - first) >= 1_000)) return null;
  return new Date(first).toISOString();
}

function parseNumericTimestamp(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const milliseconds =
    value >= 1_000_000_000_000
      ? value
      : value >= 1_000_000_000
        ? value * 1_000
        : Number.NaN;
  return Number.isFinite(milliseconds) &&
    Number.isFinite(new Date(milliseconds).getTime())
    ? milliseconds
    : null;
}

function parseQmtTimeString(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})(?:-?)(\d{2})(?:-?)(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})(?:\.(\d{1,3}))?$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  const candidate = `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.padEnd(3, '0')}+08:00`;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredFiniteNumber(value: unknown, field: string): number {
  const parsed = optionalFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    throw new Error(`QMT native ${field} must be a positive finite number`);
  }
  return parsed;
}

function optionalFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
