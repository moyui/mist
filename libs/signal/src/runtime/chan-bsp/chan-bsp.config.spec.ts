import { Period } from '@app/shared-data';
import { ChanBspConfigError, compileChanBspConfig } from './chan-bsp.config';

describe('compileChanBspConfig', () => {
  const validRule = {
    units: 'duan',
    points: { first: true, second: false, third: false },
    direction: 'buy',
  };

  it('compiles a valid configuration with the level window budget', () => {
    const plan = compileChanBspConfig(validRule, [Period.THIRTY_MIN]);

    expect(plan).toEqual({
      units: 'duan',
      points: { first: true, second: false, third: false },
      direction: 'buy',
      requiredBarCount: 200, // 30m budget
    });
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it('rejects a rule with unknown units', () => {
    expect(() =>
      compileChanBspConfig({ ...validRule, units: 'wave' }, [
        Period.THIRTY_MIN,
      ]),
    ).toThrow(ChanBspConfigError);
  });

  it('rejects a rule with an invalid direction', () => {
    expect(() =>
      compileChanBspConfig({ ...validRule, direction: 'hold' }, [
        Period.THIRTY_MIN,
      ]),
    ).toThrow(ChanBspConfigError);
  });

  it('rejects a rule with no point enabled', () => {
    expect(() =>
      compileChanBspConfig(
        {
          ...validRule,
          points: { first: false, second: false, third: false },
        },
        [Period.THIRTY_MIN],
      ),
    ).toThrow(ChanBspConfigError);
  });

  it('rejects a rule whose points are not an object', () => {
    expect(() =>
      compileChanBspConfig({ ...validRule, points: ['first'] }, [
        Period.THIRTY_MIN,
      ]),
    ).toThrow(ChanBspConfigError);
  });

  it('rejects more than one period (level must be single-valued)', () => {
    expect(() =>
      compileChanBspConfig(validRule, [Period.FIVE_MIN, Period.THIRTY_MIN]),
    ).toThrow(ChanBspConfigError);
  });

  it('rejects a day-level period (not a realtime chan_bsp level)', () => {
    expect(() => compileChanBspConfig(validRule, [Period.DAY])).toThrow(
      ChanBspConfigError,
    );
  });

  it('assigns the level window budget for every realtime level', () => {
    expect(
      compileChanBspConfig(validRule, [Period.ONE_MIN]).requiredBarCount,
    ).toBe(800);
    expect(
      compileChanBspConfig(validRule, [Period.FIVE_MIN]).requiredBarCount,
    ).toBe(500);
    expect(
      compileChanBspConfig(validRule, [Period.FIFTEEN_MIN]).requiredBarCount,
    ).toBe(300);
    expect(
      compileChanBspConfig(validRule, [Period.THIRTY_MIN]).requiredBarCount,
    ).toBe(200);
    expect(
      compileChanBspConfig(validRule, [Period.SIXTY_MIN]).requiredBarCount,
    ).toBe(120);
  });
});
