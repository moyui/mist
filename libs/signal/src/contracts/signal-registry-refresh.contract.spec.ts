import {
  decodeRefreshSignalRegistryCommandV1,
  decodeSignalRegistryRefreshV1,
  SIGNAL_REGISTRY_REFRESH_PATTERN,
} from './signal-registry-refresh.contract';

describe('signal registry refresh contract', () => {
  it('owns one stable pattern and decodes strict command/result shapes', () => {
    expect(SIGNAL_REGISTRY_REFRESH_PATTERN).toBe('signal.registry.refresh.v1');
    expect(
      decodeRefreshSignalRegistryCommandV1({ strategyDefinitionId: 7 }),
    ).toEqual({ strategyDefinitionId: 7 });
    expect(
      decodeSignalRegistryRefreshV1({
        strategyDefinitionId: 7,
        registryGeneration: 2,
        action: 'upserted',
      }),
    ).toEqual({
      strategyDefinitionId: 7,
      registryGeneration: 2,
      action: 'upserted',
    });
  });

  it.each([
    {},
    { strategyDefinitionId: 0 },
    { strategyDefinitionId: 1.5 },
    { strategyDefinitionId: 1, extra: true },
  ])('rejects invalid command %j', (value) => {
    expect(() => decodeRefreshSignalRegistryCommandV1(value)).toThrow();
  });
});
