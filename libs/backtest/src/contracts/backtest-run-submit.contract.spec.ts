import {
  decodeSubmitBacktestRunCommandV1,
  decodeSubmitBacktestRunResultV1,
} from './backtest-run-submit.contract';
import { createRpcRejectionV1, createRpcSuccessV1 } from '@app/transport/rpc';

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

  it('strictly decodes success and approved rejection branches', () => {
    expect(
      decodeSubmitBacktestRunResultV1(
        createRpcSuccessV1('rpc-test-1', null),
        'rpc-test-1',
      ),
    ).toEqual({ ok: true, meta: { correlationId: 'rpc-test-1' }, data: null });
    expect(
      decodeSubmitBacktestRunResultV1(
        createRpcRejectionV1('rpc-test-1', 'queue_full'),
        'rpc-test-1',
      ),
    ).toEqual({
      ok: false,
      meta: { correlationId: 'rpc-test-1' },
      error: { code: 'queue_full' },
    });
  });
});
