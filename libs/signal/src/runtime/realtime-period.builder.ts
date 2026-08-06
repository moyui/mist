import { Decimal8 } from '@app/decimal';
import type { StrategyBar, StrategyTrigger } from '@app/strategy';

export const REALTIME_STRATEGY_PERIODS = [1, 5, 15, 30, 60] as const;
export type RealtimeStrategyPeriod = (typeof REALTIME_STRATEGY_PERIODS)[number];

interface PendingPeriodSlot {
  readonly expectedCount: number;
  readonly bars: Map<number, StrategyBar>;
}

interface SessionPosition {
  readonly sessionStartMs: number;
  readonly minuteOffset: number;
}

export class RealtimePeriodBuilder {
  private readonly pending = new Map<string, PendingPeriodSlot>();

  accept(
    trigger: StrategyTrigger,
    sealedBar: StrategyBar | null,
    periods: ReadonlySet<number> = new Set(REALTIME_STRATEGY_PERIODS),
  ): readonly StrategyBar[] {
    assertFinalization(trigger, sealedBar);
    const emitted: StrategyBar[] = [];
    if (sealedBar && periods.has(1)) emitted.push(sealedBar);

    const position = sessionPosition(trigger.timestamp);
    for (const period of REALTIME_STRATEGY_PERIODS.slice(1).filter((value) =>
      periods.has(value),
    )) {
      const slotOffset = Math.floor(position.minuteOffset / period) * period;
      const slotStartMs = position.sessionStartMs + slotOffset * 60_000;
      const key = slotKey(
        trigger.securityId,
        trigger.source,
        period,
        slotStartMs,
      );
      const slot = this.pending.get(key) ?? {
        expectedCount: period,
        bars: new Map<number, StrategyBar>(),
      };
      if (sealedBar) slot.bars.set(trigger.timestamp.getTime(), sealedBar);
      this.pending.set(key, slot);

      if (position.minuteOffset - slotOffset === period - 1) {
        this.pending.delete(key);
        const derived = reduceSlot(
          trigger.securityId,
          trigger.source,
          period,
          slotStartMs,
          slot,
        );
        if (derived) emitted.push(derived);
      }
    }
    return Object.freeze(emitted);
  }

  reset(): void {
    this.pending.clear();
  }

  retainGroups(
    groups: readonly {
      securityId: number;
      source: StrategyTrigger['source'];
      period: number;
    }[],
  ): void {
    const retained = new Set(
      groups.map((group) =>
        groupKey(group.securityId, group.source, group.period),
      ),
    );
    for (const key of this.pending.keys()) {
      const identity = key.split('\u0000').slice(0, 3).join('\u0000');
      if (!retained.has(identity)) this.pending.delete(key);
    }
  }
}

function reduceSlot(
  securityId: number,
  source: StrategyTrigger['source'],
  period: RealtimeStrategyPeriod,
  slotStartMs: number,
  slot: PendingPeriodSlot,
): StrategyBar | null {
  const bars = [...slot.bars.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = bars.at(0);
  const last = bars.at(-1);
  if (!first || !last) return null;

  return Object.freeze({
    securityId,
    source,
    period,
    timestamp: new Date(slotStartMs),
    open: first.open,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
    close: last.close,
    volume: sumQuantity(bars, 'volume'),
    amount: sumQuantity(bars, 'amount'),
    type: bars.length === slot.expectedCount ? 'complete' : 'incomplete',
  });
}

function sumQuantity(
  bars: readonly StrategyBar[],
  field: 'volume' | 'amount',
): string | null {
  let total = Decimal8.ZERO;
  for (const bar of bars) {
    const value = bar[field];
    if (value === null) return null;
    total = total.add(Decimal8.parseCanonical(value));
  }
  return total.formatCanonical();
}

function sessionPosition(timestamp: Date): SessionPosition {
  const timestampMs = timestamp.getTime();
  if (!Number.isFinite(timestampMs) || timestampMs % 60_000 !== 0) {
    throw new TypeError('finalized strategy trigger must be minute-aligned');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const text = parts.find((part) => part.type === type)?.value;
    if (!text) throw new TypeError('could not resolve Shanghai session time');
    return Number(text);
  };
  const hour = value('hour');
  const minute = value('minute');
  const wallMinute = hour * 60 + minute;
  const morningStart = 9 * 60 + 30;
  const afternoonStart = 13 * 60;
  // Half-open sessions with a 1-minute close extension, aligned with the
  // producer bucket universe (242 buckets): 11:30 and 15:00 are legal
  // session-terminal buckets that absorb post-close tail frames and the
  // closing-auction print. See openspec/changes/fix-close-auction-bucket-semantic.
  const sessionStartWall =
    wallMinute >= morningStart && wallMinute < 11 * 60 + 31
      ? morningStart
      : wallMinute >= afternoonStart && wallMinute < 15 * 60 + 1
        ? afternoonStart
        : null;
  if (sessionStartWall === null) {
    throw new RangeError(
      'finalized strategy trigger is outside A-share sessions',
    );
  }
  const minuteOffset = wallMinute - sessionStartWall;
  return {
    sessionStartMs: timestampMs - minuteOffset * 60_000,
    minuteOffset,
  };
}

function assertFinalization(
  trigger: StrategyTrigger,
  sealedBar: StrategyBar | null,
): void {
  if (trigger.period !== 1) {
    throw new TypeError('period builder accepts only finalized 1m triggers');
  }
  if (trigger.outcome === 'discarded') {
    if (sealedBar !== null) {
      throw new TypeError('discarded trigger must not carry a StrategyBar');
    }
    return;
  }
  if (!sealedBar) throw new TypeError('sealed trigger requires a StrategyBar');
  if (
    sealedBar.securityId !== trigger.securityId ||
    sealedBar.source !== trigger.source ||
    sealedBar.period !== 1 ||
    sealedBar.timestamp.getTime() !== trigger.timestamp.getTime() ||
    sealedBar.type !== 'complete'
  ) {
    throw new TypeError('sealed observation does not match its trigger');
  }
}

function slotKey(
  securityId: number,
  source: StrategyTrigger['source'],
  period: number,
  slotStartMs: number,
): string {
  return `${securityId}\u0000${source}\u0000${period}\u0000${slotStartMs}`;
}

function groupKey(
  securityId: number,
  source: StrategyTrigger['source'],
  period: number,
): string {
  return `${securityId}\u0000${source}\u0000${period}`;
}
