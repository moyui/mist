export const SIGNAL_REGISTRY_REFRESH_PATTERN =
  'signal.registry.refresh.v1' as const;

export interface RefreshSignalRegistryCommandV1 {
  readonly strategyDefinitionId: number;
}

export interface SignalRegistryRefreshV1 {
  readonly strategyDefinitionId: number;
  readonly registryGeneration: number;
  readonly action: 'upserted' | 'removed';
}

export function decodeRefreshSignalRegistryCommandV1(
  value: unknown,
): RefreshSignalRegistryCommandV1 {
  if (!isRecord(value) || !hasExactKeys(value, ['strategyDefinitionId'])) {
    throw new TypeError('Invalid signal registry refresh command');
  }
  if (
    !Number.isSafeInteger(value.strategyDefinitionId) ||
    (value.strategyDefinitionId as number) <= 0
  ) {
    throw new TypeError('strategyDefinitionId must be a positive safe integer');
  }
  return {
    strategyDefinitionId: value.strategyDefinitionId as number,
  };
}

export function decodeSignalRegistryRefreshV1(
  value: unknown,
): SignalRegistryRefreshV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'strategyDefinitionId',
      'registryGeneration',
      'action',
    ])
  ) {
    throw new TypeError('Invalid signal registry refresh result');
  }
  if (
    !Number.isSafeInteger(value.strategyDefinitionId) ||
    (value.strategyDefinitionId as number) <= 0 ||
    !Number.isSafeInteger(value.registryGeneration) ||
    (value.registryGeneration as number) <= 0 ||
    (value.action !== 'upserted' && value.action !== 'removed')
  ) {
    throw new TypeError('Invalid signal registry refresh result fields');
  }
  return {
    strategyDefinitionId: value.strategyDefinitionId as number,
    registryGeneration: value.registryGeneration as number,
    action: value.action,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}
