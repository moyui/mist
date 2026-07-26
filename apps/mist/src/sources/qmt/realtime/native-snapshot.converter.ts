import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime-native-frame';

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
    cumulativeVolume: optionalFiniteNumber(input.native['volume']),
    cumulativeAmount: optionalFiniteNumber(input.native['amount']),
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
