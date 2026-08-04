import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime.types';
import { RealtimeQuantityValidationError } from '../../../realtime/realtime-quantity-validation.error';

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
  const eventTime = parseTdxBusinessTime(input.native['AsOf']);

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
    throw quantityError(
      field,
      'invalid_type',
      `TDX native ${field} must be a decimal string`,
    );
  }
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match) {
    throw quantityError(
      field,
      'invalid_format',
      `TDX native ${field} must be unsigned fixed-point text`,
    );
  }
  if ((match[2]?.length ?? 0) > 8) {
    throw quantityError(
      field,
      'precision_exceeded',
      `TDX native ${field} exceeds 8 fractional digits`,
    );
  }
  try {
    const normalized = normalizeExternalDecimalText(value);
    return Decimal8.parseCanonical(normalized)
      .scaleByUnit(factor)
      .formatCanonical();
  } catch (error) {
    throw quantityError(
      field,
      error instanceof RangeError ? 'out_of_range' : 'invalid_format',
      `TDX native ${field} is outside the canonical Decimal8 boundary`,
    );
  }
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
    throw quantityError(
      exactField,
      'unexpected_key',
      `TDX native quantity must use exact key ${exactField}, got ${alias}`,
    );
  }
}

function quantityError(
  field: 'Volume' | 'Amount',
  reason: ConstructorParameters<typeof RealtimeQuantityValidationError>[2],
  message: string,
): RealtimeQuantityValidationError {
  return new RealtimeQuantityValidationError(
    'tdx',
    field === 'Volume' ? 'volume' : 'amount',
    reason,
    message,
  );
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
  if (!TDX_AS_OF_PATTERN.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

const STRICT_NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const TDX_AS_OF_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
