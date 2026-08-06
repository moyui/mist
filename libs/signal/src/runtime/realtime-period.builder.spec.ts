import type { StrategyBar, StrategyTrigger } from '@app/strategy';
import { RealtimePeriodBuilder } from './realtime-period.builder';

// Shanghai = UTC+8. Session start 09:30 CST = 01:30Z. Morning session runs
// 01:30Z-03:29Z (09:30-11:29 CST); afternoon 05:00Z-06:59Z (13:00-14:59 CST).
const SESSION_START_MS = Date.UTC(2026, 7, 4, 1, 30, 0, 0);
const AFTERNOON_START_MS = Date.UTC(2026, 7, 4, 5, 0, 0, 0);

function barAt(
  offsetMinute: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(SESSION_START_MS + offsetMinute * 60_000),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: '1',
    amount: '2',
    type: 'complete',
    ...overrides,
  };
}

function afternoonBarAt(
  offsetMinute: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(AFTERNOON_START_MS + offsetMinute * 60_000),
    open: 40,
    high: 41,
    low: 39,
    close: 40.5,
    volume: '1',
    amount: '2',
    type: 'complete',
    ...overrides,
  };
}

function trigger(
  bar: StrategyBar,
  outcome: StrategyTrigger['outcome'],
): StrategyTrigger {
  return {
    securityId: bar.securityId,
    source: 'tdx',
    period: 1,
    timestamp: bar.timestamp,
    outcome,
  };
}

describe('RealtimePeriodBuilder', () => {
  it('emits a complete canonical 5m bar from five sealed constituents', () => {
    const builder = new RealtimePeriodBuilder();
    let emitted: readonly StrategyBar[] = [];
    for (let offset = 0; offset <= 4; offset++) {
      const bar = barAt(offset, {
        open: offset,
        high: offset + 2,
        low: offset - 1,
        close: offset + 1,
        volume: '1.25',
        amount: '2',
      });
      emitted = builder.accept(trigger(bar, 'sealed'), bar);
    }

    expect(emitted).toHaveLength(2);
    expect(emitted[1]).toEqual({
      securityId: 9,
      source: 'tdx',
      period: 5,
      timestamp: new Date(SESSION_START_MS),
      open: 0,
      high: 6,
      low: -1,
      close: 5,
      volume: '6.25',
      amount: '10',
      type: 'complete',
    });
  });

  it('emits incomplete without inventing a missing constituent or quantity', () => {
    const builder = new RealtimePeriodBuilder();
    for (let offset = 0; offset <= 3; offset++) {
      if (offset === 1) {
        builder.accept(trigger(barAt(offset), 'discarded'), null);
      } else {
        const bar = barAt(offset, {
          volume: offset === 2 ? null : '1',
          amount: '2',
        });
        builder.accept(trigger(bar, 'sealed'), bar);
      }
    }
    const last = barAt(4, { volume: '1', amount: '2' });
    const derived = builder.accept(trigger(last, 'sealed'), last)[1];

    expect(derived).toMatchObject({
      period: 5,
      timestamp: new Date(SESSION_START_MS),
      volume: null,
      amount: '8',
      type: 'incomplete',
    });
  });

  it('emits a complete 15m bar only after the 15th constituent', () => {
    const builder = new RealtimePeriodBuilder();
    let emitted: readonly StrategyBar[] = [];
    for (let offset = 0; offset <= 13; offset++) {
      const bar = barAt(offset);
      emitted = builder.accept(trigger(bar, 'sealed'), bar);
    }
    // The 14th constituent (offset 13) still holds the 15m slot open.
    expect(emitted.map((bar) => bar.period)).toEqual([1]);
    const last = barAt(14, { close: 50 });
    const finalEmission = builder.accept(trigger(last, 'sealed'), last);
    // Offset 14 (09:44) closes the 3rd 5m slot AND the 15m slot simultaneously.
    expect(finalEmission.map((bar) => bar.period)).toEqual([1, 5, 15]);
    expect(finalEmission[2]).toMatchObject({
      period: 15,
      timestamp: new Date(SESSION_START_MS),
      open: 10,
      close: 50,
      type: 'complete',
    });
  });

  it('emits a complete 30m bar when the 30th session minute arrives', () => {
    const builder = new RealtimePeriodBuilder();
    let emitted: readonly StrategyBar[] = [];
    // Offsets 0..28 are the first 30m slot; the slot stays open.
    for (let offset = 0; offset <= 28; offset++) {
      const bar = barAt(offset);
      emitted = builder.accept(trigger(bar, 'sealed'), bar);
    }
    expect(emitted.map((bar) => bar.period)).toEqual([1]);
    // Offset 29 (10:00 - session minute 29) closes 5m/15m/30m simultaneously.
    const last = barAt(29, { close: 77 });
    const finalEmission = builder.accept(trigger(last, 'sealed'), last);
    expect(finalEmission.map((bar) => bar.period)).toEqual([1, 5, 15, 30]);
    expect(finalEmission[3]).toMatchObject({
      period: 30,
      timestamp: new Date(SESSION_START_MS),
      open: 10,
      close: 77,
      type: 'complete',
    });
  });

  it('closes the 60m slot at 10:29 and starts a fresh afternoon slot after lunch', () => {
    const builder = new RealtimePeriodBuilder();
    let emitted: readonly StrategyBar[] = [];
    // Offsets 0..58 = 09:30-10:28, first 60m slot still open.
    for (let offset = 0; offset <= 58; offset++) {
      const bar = barAt(offset);
      emitted = builder.accept(trigger(bar, 'sealed'), bar);
    }
    expect(emitted.map((bar) => bar.period)).toEqual([1]);
    // Offset 59 (10:29) closes 5m/15m/30m/60m simultaneously.
    const morningLast = barAt(59, { close: 33 });
    const morning = builder.accept(trigger(morningLast, 'sealed'), morningLast);
    expect(morning.map((bar) => bar.period)).toEqual([1, 5, 15, 30, 60]);
    expect(morning[4]).toMatchObject({
      period: 60,
      timestamp: new Date(SESSION_START_MS),
      close: 33,
      type: 'complete',
    });

    // Afternoon 13:00 opens a NEW 60m slot (not a continuation of the morning).
    const afternoon = afternoonBarAt(0, { close: 44 });
    const after = builder.accept(trigger(afternoon, 'sealed'), afternoon);
    expect(after.map((bar) => bar.period)).toEqual([1]);
  });

  it('accepts the 11:30 morning-terminal trigger (session close extension)', () => {
    // 11:30 CST = SESSION_START_MS + 120 minutes.
    const terminal = barAt(120, { close: 55 });
    const emitted = new RealtimePeriodBuilder().accept(
      trigger(terminal, 'sealed'),
      terminal,
    );
    // 1m bar is emitted; the 11:30 minute is a valid session-terminal bucket.
    expect(emitted.some((bar) => bar.period === 1)).toBe(true);
  });

  it('accepts the 15:00 afternoon-terminal trigger (closing auction bucket)', () => {
    // 15:00 CST = AFTERNOON_START_MS + 120 minutes.
    const terminal = afternoonBarAt(120, { close: 66 });
    const emitted = new RealtimePeriodBuilder().accept(
      trigger(terminal, 'sealed'),
      terminal,
    );
    expect(emitted.some((bar) => bar.period === 1)).toBe(true);
  });

  it('rejects a trigger at 11:31 (lunch break started)', () => {
    const lunch = barAt(121);
    expect(() =>
      new RealtimePeriodBuilder().accept(trigger(lunch, 'sealed'), lunch),
    ).toThrow('outside A-share sessions');
  });

  it('rejects a trigger at 15:01 (deep post-close)', () => {
    const postClose = afternoonBarAt(121);
    expect(() =>
      new RealtimePeriodBuilder().accept(
        trigger(postClose, 'sealed'),
        postClose,
      ),
    ).toThrow('outside A-share sessions');
  });
});
