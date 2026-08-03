import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime.types';

export interface TdxNativeSnapshotInput {
  securityId: number;
  providerSymbol: string;
  capturedAt: string;
  native: Record<string, unknown>;
}

export function convertTdxNativeSnapshot(
  input: TdxNativeSnapshotInput,
): CanonicalRealtimeSnapshot {
  const last = requiredNumber(input.native, ['Now', 'now', 'Price', 'price']);
  const open = readTdxNativeNumber(input.native, ['Open', 'open']);
  const high = readTdxNativeNumber(input.native, ['Max', 'High', 'high']);
  const low = readTdxNativeNumber(input.native, ['Min', 'Low', 'low']);
  const lastClose = readTdxNativeNumber(input.native, ['LastClose']);
  const eventTime = parseTdxBusinessTime(
    input.native['DateTime'] ?? input.native['datetime'],
  );

  return {
    source: 'tdx',
    securityId: input.securityId,
    providerSymbol: input.providerSymbol,
    eventTime,
    capturedAt: input.capturedAt,
    prices: { last, open, high, low, lastClose },
    cumulativeVolume: readTdxNativeQuantity(input.native, 'Volume', 100),
    cumulativeAmount: readTdxNativeQuantity(input.native, 'Amount', 10_000),
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

function readTdxNativeQuantity(
  native: Record<string, unknown>,
  field: 'Volume' | 'Amount',
  factor: 100 | 10_000,
): string | null {
  rejectNonExactQuantityKey(native, field);
  if (!(field in native) || native[field] === null) return null;
  const value = native[field];
  if (typeof value !== 'string') {
    throw new TypeError(`TDX native ${field} must be a decimal string`);
  }
  const normalized = normalizeExternalDecimalText(value);
  return Decimal8.parseCanonical(normalized)
    .scaleByUnit(factor)
    .formatCanonical();
}

function rejectNonExactQuantityKey(
  native: Record<string, unknown>,
  exactField: 'Volume' | 'Amount',
): void {
  const normalizedField = exactField.toLowerCase();
  const alias = Object.keys(native).find(
    (key) => key !== exactField && key.toLowerCase() === normalizedField,
  );
  if (alias !== undefined) {
    throw new TypeError(
      `TDX native quantity must use exact key ${exactField}, got ${alias}`,
    );
  }
}

export function readTdxNativeNumber(
  native: Record<string, unknown>,
  aliases: readonly string[],
): number | null {
  for (const alias of aliases) {
    const value = native[alias];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && STRICT_NUMERIC_STRING.test(value)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function requiredNumber(
  native: Record<string, unknown>,
  aliases: readonly string[],
): number {
  const value = readTdxNativeNumber(native, aliases);
  if (value === null || value <= 0) {
    throw new Error(`missing positive native field: ${aliases.join('|')}`);
  }
  return value;
}

function parseTdxBusinessTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})(?:-?)(\d{2})(?:-?)(\d{2})[ T]?(\d{2}):(\d{2}):(\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const candidate = `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

const STRICT_NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
