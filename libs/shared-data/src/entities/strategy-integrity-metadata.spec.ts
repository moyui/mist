import { getMetadataArgsStorage } from 'typeorm';
import { BacktestRun } from './backtest-run.entity';
import { BacktestSignalResult } from './backtest-signal-result.entity';
import { StrategyAlertEvent } from './strategy-alert-event.entity';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategySignal } from './strategy-signal.entity';

describe('strategy integrity entity metadata', () => {
  const storage = getMetadataArgsStorage();

  it.each([
    [StrategySignal, 'strategyDefinition', 'strategy_definition_id'],
    [StrategySignal, 'strategyVersion', 'strategy_version_id'],
    [StrategyAlertEvent, 'strategySignal', 'strategy_signal_id'],
    [BacktestRun, 'strategyDefinition', 'strategy_definition_id'],
    [BacktestRun, 'strategyVersion', 'strategy_version_id'],
    [BacktestSignalResult, 'backtestRun', 'backtest_run_id'],
  ])(
    '%s.%s reuses the existing physical join column',
    (target, propertyName, joinColumnName) => {
      expect(
        storage.relations.find(
          (relation) =>
            relation.target === target &&
            relation.propertyName === propertyName,
        ),
      ).toBeDefined();
      expect(
        storage.joinColumns.find(
          (joinColumn) =>
            joinColumn.target === target &&
            joinColumn.propertyName === propertyName &&
            joinColumn.name === joinColumnName,
        ),
      ).toBeDefined();
    },
  );

  it('maps currentVersion through definition ownership and version identity', () => {
    const joinColumns = storage.joinColumns.filter(
      (joinColumn) =>
        joinColumn.target === StrategyDefinition &&
        joinColumn.propertyName === 'currentVersion',
    );

    expect(joinColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          referencedColumnName: 'strategyDefinitionId',
        }),
        expect.objectContaining({
          name: 'current_version_id',
          referencedColumnName: 'id',
        }),
      ]),
    );
  });

  it.each([
    [StrategySignal, 'contextSnapshot'],
    [StrategySignal, 'ruleSnapshot'],
    [BacktestSignalResult, 'contextSnapshot'],
    [BacktestSignalResult, 'ruleSnapshot'],
  ])('%s.%s is non-null metadata', (target, propertyName) => {
    const column = storage.columns.find(
      (candidate) =>
        candidate.target === target && candidate.propertyName === propertyName,
    );

    expect(column).toBeDefined();
    expect(column?.options.nullable).not.toBe(true);
  });

  it('keeps only run-owned backtest result identity and evidence columns', () => {
    const resultColumns = storage.columns
      .filter((column) => column.target === BacktestSignalResult)
      .map((column) => column.propertyName);

    expect(resultColumns).not.toEqual(
      expect.arrayContaining([
        'strategyDefinitionId',
        'strategyVersionId',
        'period',
        'source',
      ]),
    );
    expect(
      storage.indices.find(
        (index) =>
          index.target === BacktestSignalResult &&
          index.name === 'uq_backtest_signal_results_run_security_time',
      ),
    ).toEqual(
      expect.objectContaining({
        columns: ['backtestRunId', 'securityCode', 'signalTime'],
        unique: true,
      }),
    );
  });
});
