import type { StrategyBar } from '../market-data/strategy-bar';
import { QuantityForwardFillProjector } from './quantity-forward-fill.projector';

describe('QuantityForwardFillProjector', () => {
  it('projects volume and amount independently within one trading day', () => {
    const projector = new QuantityForwardFillProjector();
    const first = projector.project(
      bar('2026-08-03T01:30:00.000Z', '100', null),
    );
    const second = projector.project(
      bar('2026-08-03T01:31:00.000Z', null, '200'),
    );
    const third = projector.project(
      bar('2026-08-03T01:32:00.000Z', null, null),
    );

    expect(first.volume).toEqual({
      raw: '100',
      effective: '100',
      resolution: 'observed',
    });
    expect(first.amount).toEqual({
      raw: null,
      effective: null,
      resolution: 'unavailable',
    });
    expect(second.volume).toEqual({
      raw: null,
      effective: '100',
      resolution: 'forwardFilled',
    });
    expect(second.amount).toEqual({
      raw: '200',
      effective: '200',
      resolution: 'observed',
    });
    expect(third.volume.effective).toBe('100');
    expect(third.amount.effective).toBe('200');
  });

  it('treats canonical zero as an observed value that replaces prior state', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T01:30:00.000Z', '100', '200'));
    const zero = projector.project(bar('2026-08-03T01:31:00.000Z', '0', '0'));
    const filled = projector.project(
      bar('2026-08-03T01:32:00.000Z', null, null),
    );

    expect(zero.volume.resolution).toBe('observed');
    expect(zero.amount.resolution).toBe('observed');
    expect(filled.volume.effective).toBe('0');
    expect(filled.amount.effective).toBe('0');
  });

  it('clears effective values before the first bar of a new Shanghai day', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T07:00:00.000Z', '100', '200'));
    const nextDay = projector.project(
      bar('2026-08-04T01:30:00.000Z', null, null),
    );

    expect(nextDay.tradingDay).toBe('2026-08-04');
    expect(nextDay.volume.resolution).toBe('unavailable');
    expect(nextDay.amount.resolution).toBe('unavailable');
  });

  it('does not carry a null daily bar from the prior trading day', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(
      bar('2026-08-03T07:00:00.000Z', '100', '200', { period: 1440 }),
    );
    const nextDaily = projector.project(
      bar('2026-08-04T07:00:00.000Z', null, null, { period: 1440 }),
    );

    expect(nextDaily.volume.effective).toBeNull();
    expect(nextDaily.amount.effective).toBeNull();
  });

  it('isolates state by security, source and period', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T01:30:00.000Z', '100', '200'));

    const otherSecurity = projector.project(
      bar('2026-08-03T01:31:00.000Z', null, null, { securityId: 2 }),
    );
    const otherSource = projector.project(
      bar('2026-08-03T01:31:00.000Z', null, null, { source: 'qmt' }),
    );
    const otherPeriod = projector.project(
      bar('2026-08-03T01:35:00.000Z', null, null, { period: 5 }),
    );

    expect(otherSecurity.volume.effective).toBeNull();
    expect(otherSource.volume.effective).toBeNull();
    expect(otherPeriod.volume.effective).toBeNull();
  });

  it('keeps the raw StrategyBar unchanged', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T01:30:00.000Z', '100', '200'));
    const raw = bar('2026-08-03T01:31:00.000Z', null, null);
    const before = { ...raw };
    const projected = projector.project(raw);

    expect(raw).toEqual(before);
    expect(projected.rawBar).toBe(raw);
    expect(projected.rawBar.volume).toBeNull();
    expect(projected.volume.effective).toBe('100');
  });

  it('rejects non-canonical non-null quantity instead of normalizing it', () => {
    const projector = new QuantityForwardFillProjector();

    expect(() =>
      projector.project(bar('2026-08-03T01:30:00.000Z', '1.0', null)),
    ).toThrow(TypeError);
  });

  it('rejects duplicate and out-of-order bars within a market group', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T01:31:00.000Z', '1', '1'));

    expect(() =>
      projector.project(bar('2026-08-03T01:31:00.000Z', '2', '2')),
    ).toThrow(RangeError);
    expect(() =>
      projector.project(bar('2026-08-03T01:30:00.000Z', '2', '2')),
    ).toThrow(RangeError);
  });

  it('clears retained state on explicit runtime reset', () => {
    const projector = new QuantityForwardFillProjector();
    projector.project(bar('2026-08-03T01:30:00.000Z', '1', '2'));
    projector.reset();
    const projected = projector.project(
      bar('2026-08-03T01:31:00.000Z', null, null),
    );

    expect(projected.volume.resolution).toBe('unavailable');
    expect(projected.amount.resolution).toBe('unavailable');
  });
});

function bar(
  timestamp: string,
  volume: string | null,
  amount: string | null,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  return {
    securityId: 1,
    source: 'tdx',
    period: 1,
    timestamp: new Date(timestamp),
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume,
    amount,
    type: 'complete',
    ...overrides,
  };
}
