import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appModulePaths = [
  'apps/mist/src/app.module.ts',
  'apps/chan/src/chan-app.module.ts',
  'apps/schedule/src/schedule.module.ts',
];

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('database schema safety', () => {
  it.each(appModulePaths)(
    '%s disables TypeORM synchronize explicitly',
    (modulePath) => {
      const source = readRepoFile(modulePath);

      expect(source).toContain('synchronize: false');
      expect(source).not.toMatch(
        /synchronize:\s*configService\.get\(['"]NODE_ENV['"]\)\s*!==\s*['"]production['"]/,
      );
    },
  );

  it('keeps migration 006 byte-identical and aligns alert dedupe metadata', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'deploy/database/migrations/006_strategy_platform_core.sql',
      ),
    );
    const entity = readRepoFile(
      'libs/shared-data/src/entities/strategy-alert-event.entity.ts',
    );

    expect(createHash('sha256').update(migration).digest('hex')).toBe(
      '654937d497a1072fb7880e797f0a63b24e3da7f720cf2d528009a4c3875897a8',
    );
    expect(migration.toString('utf8')).toContain(
      'UNIQUE KEY `uq_strategy_alert_events_dedupe_key` (`dedupe_key`)',
    );
    expect(entity).toContain(
      "@Index('uq_strategy_alert_events_dedupe_key', ['dedupeKey'], { unique: true })",
    );
  });

  it('adds a forward-only exact nullable K measure migration', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/007_k_volume_amount_exact_decimal.sql',
    );
    const entity = readRepoFile('libs/shared-data/src/entities/k.entity.ts');
    const audit = readRepoFile('deploy/database/audit-k-decimal-migration.sql');

    expect(migration).toContain('MODIFY COLUMN `volume` decimal(36,8) NULL');
    expect(migration).toContain('MODIFY COLUMN `amount` decimal(36,8) NULL');
    expect(entity).toContain("type: 'decimal'");
    expect(entity).toContain('precision: 36');
    expect(entity).toContain('scale: 8');
    expect(entity).toContain('volume: string | null = null');
    expect(entity).toContain('amount: string | null = null');
    expect(audit).toContain('normalized_row_digest');
    expect(audit).toContain('CAST(`volume` AS decimal(36,8))');
    expect(audit).toContain('CAST(`amount` AS decimal(36,8))');
  });

  it('removes retired K extension fullCode columns with migration 008', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/008_remove_k_extension_full_code.sql',
    );
    const providerAudit = readRepoFile(
      'deploy/database/audit-provider-format-code.sql',
    );

    for (const table of [
      'k_extensions_tdx',
      'k_extensions_qmt',
      'k_extensions_ef',
    ]) {
      expect(migration).toContain(`ALTER TABLE \`${table}\``);
    }
    expect(migration.match(/DROP COLUMN `fullCode`/g)).toHaveLength(3);
    expect(providerAudit).toContain("`source` IN ('tdx', 'qmt')");
    expect(providerAudit).toContain("NOT REGEXP '^[0-9]{6}\\\\.(SH|SZ|BJ)$'");
  });

  it('hardens strategy ownership and evidence with migration 009', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/009_strategy_database_integrity.sql',
    );
    const audit = readRepoFile(
      'deploy/database/audit-strategy-database-integrity.sql',
    );

    expect(migration).toContain(
      'UNIQUE KEY `uq_strategy_versions_definition_id`',
    );
    expect(migration).toContain('FOREIGN KEY (`id`, `current_version_id`)');
    expect(migration).toContain(
      "CHECK (`status` <> 'enabled' OR `current_version_id` IS NOT NULL)",
    );
    expect(
      migration.match(/`(?:context|rule)_snapshot` json NOT NULL/g),
    ).toHaveLength(4);
    for (const column of [
      'strategy_definition_id',
      'strategy_version_id',
      'period',
      'source',
    ]) {
      expect(migration).toContain(`DROP COLUMN \`${column}\``);
    }
    expect(migration).toContain(
      'UNIQUE KEY `uq_backtest_signal_results_run_security_time`',
    );
    for (const checkName of [
      'current_version_missing_or_foreign',
      'enabled_definition_without_current_version',
      'strategy_signal_null_snapshot',
      'backtest_result_null_snapshot',
      'backtest_result_run_mismatch',
      'duplicate_backtest_result_identity',
    ]) {
      expect(audit).toContain(`'${checkName}'`);
    }
    expect(audit).not.toMatch(/\bUPDATE\b/i);
    expect(audit).not.toContain('JSON_OBJECT');
  });
});
