import type { StrategyBar, StrategyTrigger } from '@app/strategy';
import { RealtimePeriodBuilder } from './realtime-period.builder';

describe('RealtimePeriodBuilder', () => {
  it('emits a complete canonical 5m bar from five sealed constituents', () => {
    const builder = new RealtimePeriodBuilder();
    let emitted: readonly StrategyBar[] = [];
    for (let minute = 30; minute <= 34; minute++) {
      const bar = makeBar(minute, {
        open: minute,
        high: minute + 2,
        low: minute - 1,
        close: minute + 1,
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
      timestamp: new Date('2026-08-04T01:30:00.000Z'),
      open: 30,
      high: 36,
      low: 29,
      close: 35,
      volume: '6.25',
      amount: '10',
      type: 'complete',
    });
  });

  it('emits incomplete without inventing a missing constituent or quantity', () => {
    const builder = new RealtimePeriodBuilder();
    for (let minute = 30; minute <= 33; minute++) {
      if (minute === 31) {
        builder.accept(trigger(makeBar(minute), 'discarded'), null);
      } else {
        const bar = makeBar(minute, {
          volume: minute === 32 ? null : '1',
          amount: '2',
        });
        builder.accept(trigger(bar, 'sealed'), bar);
      }
    }
    const last = makeBar(34, { volume: '1', amount: '2' });
    const derived = builder.accept(trigger(last, 'sealed'), last)[1];

    expect(derived).toMatchObject({
      period: 5,
      timestamp: new Date('2026-08-04T01:30:00.000Z'),
      volume: null,
      amount: '8',
      type: 'incomplete',
    });
  });
});

function makeBar(
  minute: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(
      `2026-08-04T01:${String(minute).padStart(2, '0')}:00.000Z`,
    ),
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
