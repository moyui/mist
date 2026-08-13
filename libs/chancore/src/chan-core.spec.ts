import * as publicApi from './index';
import { ChanCore, ChanInputError, ChanInvariantError } from './index';
import type { ChanK } from './index';

describe('ChanCore public facade', () => {
  it('publishes only the approved runtime surface and algorithm version', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'BiStatus',
        'BiType',
        'ChanCore',
        'ChanInputError',
        'ChanInvariantError',
        'ChannelLevel',
        'ChannelStatus',
        'ChannelType',
        'DuanStatus',
        'DuanType',
        'FenxingType',
        'TrendDirection',
      ].sort(),
    );
    expect(ChanCore.algorithmVersion).toBe(1);
    expect('analyze' in ChanCore).toBe(false);
  });

  it('returns the approved empty results', () => {
    expect(ChanCore.mergeK([])).toEqual([]);
    expect(ChanCore.findFenxings([])).toEqual([]);
    expect(ChanCore.createBi([])).toEqual({ phaseA: [], phaseB: [] });
    expect(ChanCore.createChannels([])).toEqual({ phaseA: [], phaseB: [] });
    expect(ChanCore.createDuan([])).toEqual({ phaseA: [], phaseB: [] });
  });

  it.each([
    ['mergeK', ChanCore.mergeK],
    ['findFenxings', ChanCore.findFenxings],
    ['createBi', ChanCore.createBi],
    ['createChannels', ChanCore.createChannels],
    ['createDuan', ChanCore.createDuan],
  ] as const)('validates input at the %s facade', (_name, operation) => {
    const invalid = [makeK({ volume: 10 as unknown as string })];

    expect(() => operation(invalid)).toThrow(ChanInputError);
  });

  it('is deterministic and does not mutate caller-owned input', () => {
    const orderedK = Object.freeze([
      freezeK(makeK()),
      freezeK(
        makeK({
          id: 2,
          time: new Date('2026-07-01T01:32:00.000Z'),
          high: 11,
          low: 2,
        }),
      ),
      freezeK(
        makeK({
          id: 3,
          time: new Date('2026-07-01T01:33:00.000Z'),
          high: 9,
          low: 1,
        }),
      ),
    ]);
    const before = inputFingerprint(orderedK);

    const first = {
      mergedK: ChanCore.mergeK(orderedK),
      fenxings: ChanCore.findFenxings(orderedK),
      bis: ChanCore.createBi(orderedK),
      channels: ChanCore.createChannels(orderedK),
      duans: ChanCore.createDuan(orderedK),
    };
    const second = {
      mergedK: ChanCore.mergeK(orderedK),
      fenxings: ChanCore.findFenxings(orderedK),
      bis: ChanCore.createBi(orderedK),
      channels: ChanCore.createChannels(orderedK),
      duans: ChanCore.createDuan(orderedK),
    };

    expect(second).toEqual(first);
    expect(inputFingerprint(orderedK)).toEqual(before);
    expect(JSON.stringify(first)).not.toContain('algorithmVersion');
  });

  it('keeps approved errors independent from transport and persistence', () => {
    for (const error of [
      new ChanInputError('input'),
      new ChanInvariantError('invariant'),
    ]) {
      expect(error).toBeInstanceOf(Error);
      expect('status' in error).toBe(false);
      expect('getStatus' in error).toBe(false);
      expect('query' in error).toBe(false);
    }
  });
});

function makeK(overrides: Partial<ChanK> = {}): ChanK {
  return {
    id: 1,
    symbol: '600519',
    time: new Date('2026-07-01T01:31:00.000Z'),
    open: 5,
    high: 10,
    low: 1,
    close: 6,
    volume: '100',
    amount: '600',
    ...overrides,
  };
}

function freezeK(k: ChanK): ChanK {
  Object.freeze(k.time);
  return Object.freeze(k);
}

function inputFingerprint(orderedK: readonly ChanK[]) {
  return orderedK.map((k) => ({
    ...k,
    time: k.time.getTime(),
  }));
}
