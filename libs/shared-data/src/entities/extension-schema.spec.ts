import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('extension entity schema metadata', () => {
  it('keeps KExtensionEf.outerVolume aligned with integer volume schema', () => {
    const source = readRepoFile(
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
    );
    const migration = readRepoFile(
      'deploy/database/migrations/001_init_core_tables.sql',
    );

    expect(source).toContain("type: 'bigint'");
    expect(source).toMatch(/outerVolume:\s*bigint\s*(?:\|\s*null)?\s*=/);
    expect(migration).toContain('`outerVolume` bigint NULL');
    expect(migration).not.toContain('`outerVolume` decimal(20,0) NULL');
  });

  it('provides a forward migration for existing KExtensionEf outerVolume columns', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/004_k_extension_ef_outer_volume_bigint.sql',
    );

    expect(migration).toContain('ALTER TABLE `k_extensions_ef`');
    expect(migration).toContain('MODIFY COLUMN `outerVolume` bigint NULL');
  });

  it('keeps nullable KExtensionEf fields nullable in TypeScript defaults', () => {
    const source = readRepoFile(
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
    );

    for (const field of [
      'amplitude',
      'changePct',
      'changeAmt',
      'turnoverRate',
      'volumeCount',
      'innerVolume',
      'outerVolume',
      'prevClose',
      'prevOpen',
    ]) {
      expect(source).toMatch(
        new RegExp(`${field}:\\s*[^=;]+\\|\\s*null\\s*=\\s*null`),
      );
    }
    expect(source).not.toMatch(/=\s*0n?;/);
  });

  it('does not expose the retired fullCode identity on K extensions', () => {
    for (const entityPath of [
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
      'libs/shared-data/src/entities/k-extension-tdx.entity.ts',
      'libs/shared-data/src/entities/k-extension-qmt.entity.ts',
    ]) {
      expect(readRepoFile(entityPath)).not.toContain('fullCode');
    }
  });

  it('exposes kId columns for extension one-to-one keys', () => {
    const extensionEntityPaths = [
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
      'libs/shared-data/src/entities/k-extension-tdx.entity.ts',
      'libs/shared-data/src/entities/k-extension-qmt.entity.ts',
    ];

    for (const entityPath of extensionEntityPaths) {
      const source = readRepoFile(entityPath);

      expect(source).toContain("@Column({ name: 'k_id', select: false })");
      expect(source).toMatch(/kId!:\s*number/);
    }
  });

  it('keeps unique k_id keys in extension migration SQL', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/001_init_core_tables.sql',
    );

    for (const table of [
      'k_extensions_ef',
      'k_extensions_tdx',
      'k_extensions_qmt',
    ]) {
      expect(migration).toContain(`UNIQUE KEY \`uq_${table}_k_id\` (\`k_id\`)`);
    }
  });

  it('keeps unique k_id indexes in extension TypeORM metadata', () => {
    const extensionEntityPaths = [
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
      'libs/shared-data/src/entities/k-extension-tdx.entity.ts',
      'libs/shared-data/src/entities/k-extension-qmt.entity.ts',
    ];

    for (const entityPath of extensionEntityPaths) {
      const source = readRepoFile(entityPath);

      expect(source).toContain('@Index({ unique: true })');
    }
  });

  it('renames QMT extension schema and migrates old mqmt test data', () => {
    const source = readRepoFile(
      'libs/shared-data/src/entities/k-extension-qmt.entity.ts',
    );
    const initMigration = readRepoFile(
      'deploy/database/migrations/001_init_core_tables.sql',
    );
    const renameMigration = readRepoFile(
      'deploy/database/migrations/005_rename_mqmt_to_qmt.sql',
    );

    expect(source).toContain("name: 'k_extensions_qmt'");
    expect(source).toContain('export class KExtensionQmt');
    expect(initMigration).toMatch(/enum\('ef',\s*'tdx',\s*'qmt'\)/);
    expect(initMigration).toContain(
      'CREATE TABLE IF NOT EXISTS `k_extensions_qmt`',
    );
    expect(initMigration).not.toContain('k_extensions_mqmt');
    expect(renameMigration).toMatch(/`source`='qmt'/);
    expect(renameMigration).toMatch(/`source`='mqmt'/);
    expect(renameMigration).toContain(
      'RENAME TABLE `k_extensions_mqmt` TO `k_extensions_qmt`',
    );
  });
});
