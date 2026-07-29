import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appModulePaths = [
  'apps/mist/src/app.module.ts',
  'apps/chan/src/chan-app.module.ts',
  'apps/schedule/src/schedule.module.ts',
];

const typeormConfigPaths = [
  ...appModulePaths,
  'apps/mist/src/realtime/hil/realtime-subscription-hil.ts',
];

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('database schema safety', () => {
  const immutableMigrationDigests = new Map([
    [
      '001_init_core_tables.sql',
      '53cd8a20d52b9a38c49c9f312a7db2b653d5a0cf20b7ba30597c8fa6c1a8cbb1',
    ],
    [
      '002_add_tdx_vol_in_stock.sql',
      'ed26462bbd32495ab8bfee839a6749139c94fe81735b7d6c6e0ba728ce71b1c4',
    ],
    [
      '003_security_code_identity.sql',
      'b2ceee0b6b6aacdc1469272611e60cdc0682fd7ad58f7bdb8c7826da4c3805aa',
    ],
    [
      '004_k_extension_ef_outer_volume_bigint.sql',
      '5754074e87d24c6a5af489ab5ea6d9b35557fc743609aa4bf1000d7a079a00d7',
    ],
    [
      '005_rename_mqmt_to_qmt.sql',
      '91273173bb886edda161fcc046481a3c12eda37154277b63db35e08f51b88366',
    ],
    [
      '006_strategy_platform_core.sql',
      '654937d497a1072fb7880e797f0a63b24e3da7f720cf2d528009a4c3875897a8',
    ],
    [
      '007_k_volume_amount_exact_decimal.sql',
      '18e09b481cd8a28fcc82e75353fc0c67ad38078ef10355fff993a1f4ea40a4f9',
    ],
    [
      '008_remove_k_extension_full_code.sql',
      '80e3f31f265d1e24efe5f612b1735f8c1bc874cc7d6ab8d608fc4841dd4ad600',
    ],
    [
      '009_strategy_database_integrity.sql',
      '82d2ff311ab2f5345ded55060a0ea162707228e5b6ad6f91eac3c4040a284ac7',
    ],
    [
      '010_normalize_managed_column_names.sql',
      '8e90ae62370edf6796cf6e385e9d8dc12866933208e0f8f29ca560de6453132a',
    ],
  ]);

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

  it.each(typeormConfigPaths)(
    '%s interprets MySQL DATETIME as the market wall clock',
    (modulePath) => {
      expect(readRepoFile(modulePath)).toContain("timezone: '+08:00'");
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

  it('audits legacy Chan tables without adding destructive DDL', () => {
    const audit = readRepoFile('deploy/database/audit-legacy-chan-tables.sql');

    for (const table of [
      'chan_bis',
      'chan_fenxings',
      'chan_index_periods',
      'chan_states',
    ]) {
      expect(audit).toContain(`'${table}'`);
    }
    expect(audit).toContain('exact_count_sql');
    expect(audit).toContain('capture_ddl_sql');
    expect(audit).toContain('SHOW CREATE TABLE');
    expect(audit).not.toMatch(
      /\b(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE)\s+TABLE\b/i,
    );
  });

  it.each([...immutableMigrationDigests])(
    'keeps migration %s byte-identical',
    (migrationName, expectedDigest) => {
      const migration = readFileSync(
        join(process.cwd(), 'deploy/database/migrations', migrationName),
      );

      expect(createHash('sha256').update(migration).digest('hex')).toBe(
        expectedDigest,
      );
    },
  );

  it('normalizes exactly the approved managed camelCase columns in migration 010', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/010_normalize_managed_column_names.sql',
    );
    const audit = readRepoFile(
      'deploy/database/audit-managed-column-names.sql',
    );
    const mappings = [
      ['security_source_configs', 'formatCode', 'format_code'],
      ['k', 'securityId', 'security_id'],
      ['k_extensions_ef', 'changePct', 'change_pct'],
      ['k_extensions_ef', 'changeAmt', 'change_amt'],
      ['k_extensions_ef', 'turnoverRate', 'turnover_rate'],
      ['k_extensions_ef', 'volumeCount', 'volume_count'],
      ['k_extensions_ef', 'innerVolume', 'inner_volume'],
      ['k_extensions_ef', 'outerVolume', 'outer_volume'],
      ['k_extensions_ef', 'prevClose', 'prev_close'],
      ['k_extensions_ef', 'prevOpen', 'prev_open'],
      ['k_extensions_tdx', 'forwardFactor', 'forward_factor'],
      ['k_extensions_tdx', 'volInStock', 'vol_in_stock'],
      ['k_extensions_tdx', 'backwardFactor', 'backward_factor'],
      ['k_extensions_tdx', 'volumeRatio', 'volume_ratio'],
      ['k_extensions_tdx', 'turnoverRate', 'turnover_rate'],
      ['k_extensions_tdx', 'turnoverAmount', 'turnover_amount'],
      ['k_extensions_tdx', 'totalMarketValue', 'total_market_value'],
      ['k_extensions_tdx', 'floatMarketValue', 'float_market_value'],
      ['k_extensions_tdx', 'earningsPerShare', 'earnings_per_share'],
      ['k_extensions_tdx', 'priceEarningsRatio', 'price_earnings_ratio'],
      ['k_extensions_tdx', 'priceToBookRatio', 'price_to_book_ratio'],
      ['k_extensions_qmt', 'preClose', 'pre_close'],
      ['k_extensions_qmt', 'suspendFlag', 'suspend_flag'],
      ['k_extensions_qmt', 'openInterest', 'open_interest'],
      ['k_extensions_qmt', 'effectiveDividendType', 'effective_dividend_type'],
      ['k_extensions_qmt', 'nativePeriod', 'native_period'],
    ] as const;

    expect(migration.match(/RENAME COLUMN/g)).toHaveLength(mappings.length);
    for (const [table, oldName, newName] of mappings) {
      expect(migration).toContain(
        `RENAME COLUMN \`${oldName}\` TO \`${newName}\``,
      );
      expect(audit).toContain(`('${table}', '${oldName}', '${newName}')`);
    }
    expect(audit).toContain('post_migration_ready');
    expect(audit).toContain('invalid_mapping_count');
    expect(audit).toContain("REGEXP BINARY '[A-Z]'");
  });

  it('normalizes exactly five legacy audit timestamp pairs in migration 011', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/011_normalize_audit_timestamp_names.sql',
    );
    const audit = readRepoFile('deploy/database/audit-timestamp-names.sql');
    const tables = [
      'security_source_configs',
      'k',
      'k_extensions_ef',
      'k_extensions_tdx',
      'k_extensions_qmt',
    ];

    expect(migration.match(/RENAME COLUMN/g)).toHaveLength(10);
    for (const table of tables) {
      expect(migration).toContain(`ALTER TABLE \`${table}\``);
      expect(audit).toContain(
        `('${table}', 'create_time', 'created_at', 'created')`,
      );
      expect(audit).toContain(
        `('${table}', 'update_time', 'updated_at', 'updated')`,
      );
    }
    expect(audit).toContain('post_migration_ready');
    expect(audit).toContain('invalid_mapping_count');
    expect(audit).toContain('invalid_attribute_count');
  });
});
