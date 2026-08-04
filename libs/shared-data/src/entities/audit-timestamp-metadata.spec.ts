import { getMetadataArgsStorage } from 'typeorm';
import { BacktestRun } from './backtest-run.entity';
import { BacktestSignalResult } from './backtest-signal-result.entity';
import { KExtensionEf } from './k-extension-ef.entity';
import { KExtensionQmt } from './k-extension-qmt.entity';
import { KExtensionTdx } from './k-extension-tdx.entity';
import { K } from './k.entity';
import { SecuritySourceConfig } from './security-source-config.entity';
import { Security } from './security.entity';
import { RealtimeSubscriptionAssignment } from './realtime-subscription-assignment.entity';
import { StrategyAlertEvent } from './strategy-alert-event.entity';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategySignal } from './strategy-signal.entity';
import { StrategyVersion } from './strategy-version.entity';

const creationTargets = [
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  BacktestRun,
  BacktestSignalResult,
];

const mutableTargets = [
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  StrategyDefinition,
  StrategyAlertEvent,
  BacktestRun,
];

const appendOnlyTargets = [
  StrategyVersion,
  StrategySignal,
  BacktestSignalResult,
];

describe('audit timestamp entity metadata', () => {
  const storage = getMetadataArgsStorage();

  it.each(creationTargets)('%s maps createdAt to created_at', (target) => {
    expect(
      storage.columns.find(
        (column) =>
          column.target === target &&
          column.propertyName === 'createdAt' &&
          column.mode === 'createDate' &&
          column.options.name === 'created_at',
      ),
    ).toBeDefined();
  });

  it.each(mutableTargets)('%s maps updatedAt to updated_at', (target) => {
    expect(
      storage.columns.find(
        (column) =>
          column.target === target &&
          column.propertyName === 'updatedAt' &&
          column.mode === 'updateDate' &&
          column.options.name === 'updated_at',
      ),
    ).toBeDefined();
  });

  it.each(appendOnlyTargets)('%s remains creation-only', (target) => {
    expect(
      storage.columns.find(
        (column) => column.target === target && column.mode === 'updateDate',
      ),
    ).toBeUndefined();
  });

  it('retires the old TypeScript audit property names', () => {
    const auditedColumns = storage.columns.filter((column) =>
      creationTargets.includes(
        column.target as (typeof creationTargets)[number],
      ),
    );

    expect(
      auditedColumns.some((column) =>
        ['createTime', 'updateTime'].includes(column.propertyName),
      ),
    ).toBe(false);
  });

  it('serializes mutable and append-only entities with the new JSON contract', () => {
    const instant = new Date('2026-07-29T02:00:00.000Z');
    const mutableJson = JSON.parse(
      JSON.stringify(
        Object.assign(new StrategyDefinition(), {
          createdAt: instant,
          updatedAt: instant,
        }),
      ),
    ) as Record<string, unknown>;
    const appendOnlyJson = JSON.parse(
      JSON.stringify(
        Object.assign(new StrategyVersion(), { createdAt: instant }),
      ),
    ) as Record<string, unknown>;

    expect(mutableJson).toMatchObject({
      createdAt: '2026-07-29T02:00:00.000Z',
      updatedAt: '2026-07-29T02:00:00.000Z',
    });
    expect(mutableJson).not.toHaveProperty('createTime');
    expect(mutableJson).not.toHaveProperty('updateTime');
    expect(appendOnlyJson).toMatchObject({
      createdAt: '2026-07-29T02:00:00.000Z',
    });
    expect(appendOnlyJson).not.toHaveProperty('updatedAt');
  });
});
