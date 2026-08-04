import { getMetadataArgsStorage } from 'typeorm';
import { BacktestRun } from './backtest-run.entity';
import { BacktestSignalResult } from './backtest-signal-result.entity';
import { StrategyAlertEvent } from './strategy-alert-event.entity';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategySignal } from './strategy-signal.entity';
import { StrategyVersion } from './strategy-version.entity';

describe('strategy integrity entity metadata', () => {
  const storage = getMetadataArgsStorage();

  it.each([
    [StrategySignal, 'strategyDefinition', 'strategy_definition_id'],
    [StrategySignal, 'strategyVersion', 'strategy_version_id'],
    [StrategySignal, 'security', 'security_id'],
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
    expect(
      storage.indices.find(
        (index) =>
          index.target === BacktestSignalResult &&
          index.name === 'idx_backtest_signal_results_run_time_id',
      ),
    ).toEqual(
      expect.objectContaining({
        columns: ['backtestRunId', 'signalTime', 'id'],
        unique: false,
      }),
    );
  });

  it('requires non-null target issue metadata on every backtest run', () => {
    const column = storage.columns.find(
      (candidate) =>
        candidate.target === BacktestRun &&
        candidate.propertyName === 'targetIssues',
    );
    expect(column).toBeDefined();
    expect(column?.options.name).toBe('target_issues');
    expect(column?.options.nullable).not.toBe(true);
  });

  it('maps the approved strategy signal-kind columns without defaults', () => {
    for (const [target, propertyName] of [
      [StrategyVersion, 'signalKind'],
      [StrategySignal, 'signalKind'],
    ] as const) {
      const column = storage.columns.find(
        (candidate) =>
          candidate.target === target &&
          candidate.propertyName === propertyName,
      );

      expect(column).toBeDefined();
      expect(column?.options.name).toBe('signal_kind');
      expect(column?.options.type).toBe('enum');
      expect(column?.options.nullable).not.toBe(true);
      expect(column?.options.default).toBeUndefined();
    }
  });

  it('uses canonical Security identity with a named restrictive foreign key', () => {
    const securityJoin = storage.joinColumns.find(
      (joinColumn) =>
        joinColumn.target === StrategySignal &&
        joinColumn.propertyName === 'security',
    );
    const securityRelation = storage.relations.find(
      (relation) =>
        relation.target === StrategySignal &&
        relation.propertyName === 'security',
    );
    const securityIndex = storage.indices.find(
      (index) =>
        index.target === StrategySignal &&
        index.name === 'idx_strategy_signals_security_time',
    );

    expect(securityJoin).toEqual(
      expect.objectContaining({
        name: 'security_id',
        foreignKeyConstraintName: 'fk_strategy_signals_security',
      }),
    );
    expect(securityRelation?.options).toEqual(
      expect.objectContaining({
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      }),
    );
    expect(securityIndex).toEqual(
      expect.objectContaining({
        columns: ['securityId', 'signalTime'],
        unique: false,
      }),
    );
  });

  it('does not retain StrategySignal.securityCode metadata', () => {
    expect(
      storage.columns.find(
        (column) =>
          column.target === StrategySignal &&
          column.propertyName === 'securityCode',
      ),
    ).toBeUndefined();
  });
});
