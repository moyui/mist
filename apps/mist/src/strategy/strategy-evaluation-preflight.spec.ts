import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('strategy evaluation production preflight', () => {
  const auditPath = join(
    process.cwd(),
    'deploy/database/audit-strategy-evaluation-contract.sql',
  );
  const audit = readFileSync(auditPath, 'utf8');
  const targetTables = [
    'strategy_definitions',
    'strategy_versions',
    'strategy_signals',
    'strategy_alert_events',
    'backtest_runs',
    'backtest_signal_results',
  ];

  it('inventories the migration ledger and all six target tables', () => {
    expect(audit).toContain('FROM `schema_migrations`');
    for (const table of targetTables) {
      expect(audit).toContain(`'${table}'`);
      expect(audit).toContain(`SHOW CREATE TABLE \`${table}\``);
      expect(audit).toMatch(
        new RegExp(`SELECT '${table}'.*COUNT\\(\\*\\)`, 's'),
      );
    }
  });

  it('captures columns, indexes and named constraints from information_schema', () => {
    expect(audit).toContain('`information_schema`.`COLUMNS`');
    expect(audit).toContain('`information_schema`.`STATISTICS`');
    expect(audit).toContain('`information_schema`.`TABLE_CONSTRAINTS`');
    expect(audit).toContain('`information_schema`.`KEY_COLUMN_USAGE`');
  });

  it('contains no schema or data mutation statement', () => {
    expect(audit).not.toMatch(
      /^\s*(?:ALTER|CREATE|DELETE|DROP|INSERT|RENAME|REPLACE|TRUNCATE|UPDATE)\b/im,
    );
  });
});
