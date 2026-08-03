import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('strategy evaluation production preflight', () => {
  const auditPath = join(
    process.cwd(),
    'deploy/database/audit-strategy-evaluation-contract.sql',
  );
  const audit = readFileSync(auditPath, 'utf8');
  const readback = readFileSync(
    join(
      process.cwd(),
      'deploy/database/readback-strategy-evaluation-contract.sql',
    ),
    'utf8',
  );
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
    expect(audit).toContain('strategy_signal_security_fk_count');
  });

  it.each([
    ['preflight', audit],
    ['readback', readback],
  ])('%s contains no schema or data mutation statement', (_name, sql) => {
    expect(sql).not.toMatch(
      /^\s*(?:ALTER|CREATE|DELETE|DROP|INSERT|RENAME|REPLACE|TRUNCATE|UPDATE)\b/im,
    );
  });

  it('readbacks exact target columns, FK, indexes and migration ledger', () => {
    for (const readiness of [
      'strategy_version_signal_kind_ready',
      'strategy_signal_security_id_ready',
      'strategy_signal_kind_ready',
      'strategy_signal_security_index_ready',
      'strategy_signal_security_fk_ready',
      'alert_dedupe_unique_ready',
    ]) {
      expect(readback).toContain(readiness);
    }
    expect(readback).toContain('retired_security_code_count');
    expect(readback).toContain('unapproved_signal_unique_count');
    expect(readback).toContain('014_evolve_strategy_evaluation_contract.sql');
    expect(readback).toContain("`references_rows`.`DELETE_RULE` = 'RESTRICT'");
    expect(readback).toContain("`references_rows`.`UPDATE_RULE` = 'RESTRICT'");
    expect(readback).toContain('SHOW CREATE TABLE `strategy_versions`');
    expect(readback).toContain('SHOW CREATE TABLE `strategy_signals`');
  });
});
