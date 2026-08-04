import type { StrategyTrigger } from '@app/strategy';

export const STRATEGY_TRIGGER_BULLMQ_PREFIX = 'mist-bullmq';
export const STRATEGY_TRIGGER_QUEUE_NAME = 'strategy-trigger';
export const CANDLE_FINALIZED_JOB_NAME = 'candle_finalized';
export const STRATEGY_TRIGGER_WORKER_CONCURRENCY = 1;
export const STRATEGY_TRIGGER_JOB_TIMEOUT_MS = 30_000;

export const CANDLE_FINALIZED_JOB_OPTIONS = Object.freeze({
  attempts: 1,
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 86_400 }),
});

interface CandleFinalizedTriggerBaseV1 {
  readonly contractVersion: 1;
  readonly securityId: number;
  readonly source: 'tdx' | 'qmt';
  readonly period: '1m';
  readonly triggerTime: string;
}

export type CandleFinalizedTriggerV1 = CandleFinalizedTriggerBaseV1 &
  (
    | {
        readonly outcome: 'sealed';
        readonly triggerPrice: number;
      }
    | {
        readonly outcome: 'discarded';
        readonly triggerPrice: null;
      }
  );

const TRIGGER_KEYS = Object.freeze([
  'contractVersion',
  'securityId',
  'source',
  'period',
  'triggerTime',
  'outcome',
  'triggerPrice',
]);
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function decodeCandleFinalizedTriggerV1(
  input: unknown,
): CandleFinalizedTriggerV1 {
  if (!isRecord(input) || !hasExactKeys(input, TRIGGER_KEYS)) {
    throw new TypeError(
      'candle_finalized data must contain exactly the V1 trigger fields',
    );
  }
  if (input.contractVersion !== 1) {
    throw new TypeError('candle_finalized contractVersion must be 1');
  }
  const securityId = input.securityId;
  if (
    typeof securityId !== 'number' ||
    !Number.isSafeInteger(securityId) ||
    securityId <= 0
  ) {
    throw new TypeError(
      'candle_finalized securityId must be a positive safe integer',
    );
  }
  if (input.source !== 'tdx' && input.source !== 'qmt') {
    throw new TypeError('candle_finalized source must be tdx or qmt');
  }
  if (input.period !== '1m') {
    throw new TypeError('candle_finalized period must be 1m');
  }
  if (
    typeof input.triggerTime !== 'string' ||
    !RFC3339_PATTERN.test(input.triggerTime) ||
    !Number.isFinite(Date.parse(input.triggerTime))
  ) {
    throw new TypeError('candle_finalized triggerTime must be RFC3339');
  }
  if (input.outcome === 'sealed') {
    if (
      typeof input.triggerPrice !== 'number' ||
      !Number.isFinite(input.triggerPrice)
    ) {
      throw new TypeError(
        'sealed candle_finalized triggerPrice must be finite',
      );
    }
    return Object.freeze({
      contractVersion: 1,
      securityId,
      source: input.source,
      period: '1m',
      triggerTime: input.triggerTime,
      outcome: 'sealed',
      triggerPrice: input.triggerPrice,
    });
  }
  if (input.outcome === 'discarded') {
    if (input.triggerPrice !== null) {
      throw new TypeError(
        'discarded candle_finalized triggerPrice must be null',
      );
    }
    return Object.freeze({
      contractVersion: 1,
      securityId,
      source: input.source,
      period: '1m',
      triggerTime: input.triggerTime,
      outcome: 'discarded',
      triggerPrice: null,
    });
  }
  throw new TypeError('candle_finalized outcome must be sealed or discarded');
}

export function candleFinalizedJobId(
  trigger: CandleFinalizedTriggerV1,
): string {
  const accepted = decodeCandleFinalizedTriggerV1(trigger);
  return `candlefinal-v1-${accepted.source}-${accepted.securityId}-${accepted.period}-${Date.parse(accepted.triggerTime)}`;
}

export function toStrategyTrigger(
  trigger: CandleFinalizedTriggerV1,
): StrategyTrigger {
  const accepted = decodeCandleFinalizedTriggerV1(trigger);
  return Object.freeze({
    securityId: accepted.securityId,
    source: accepted.source,
    period: 1,
    timestamp: new Date(accepted.triggerTime),
    outcome: accepted.outcome,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}
