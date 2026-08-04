import {
  decodeSubmitBacktestRunCommandV1,
  decodeSubmitBacktestRunErrorCodeV1,
  decodeSubmitBacktestRunSuccessV1,
} from './backtest-run-submit.contract';

describe('backtest run submit contract', () => {
  it('accepts only an exact positive runId command', () => {
    expect(decodeSubmitBacktestRunCommandV1({ runId: 7 })).toEqual({
      runId: 7,
    });
    expect(() =>
      decodeSubmitBacktestRunCommandV1({ runId: 7, extra: true }),
    ).toThrow();
    expect(() => decodeSubmitBacktestRunCommandV1({ runId: 0 })).toThrow();
    expect(() => decodeSubmitBacktestRunCommandV1({ runId: 1.5 })).toThrow();
  });

  it('strictly decodes domain success and rejection branches', () => {
    expect(decodeSubmitBacktestRunSuccessV1(null)).toBeNull();
    expect(() => decodeSubmitBacktestRunSuccessV1({})).toThrow();
    expect(decodeSubmitBacktestRunErrorCodeV1('queue_full')).toBe('queue_full');
    expect(() => decodeSubmitBacktestRunErrorCodeV1('unknown')).toThrow();
  });
});
