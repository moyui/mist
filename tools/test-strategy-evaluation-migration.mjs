import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import mysql from 'mysql2/promise';
import { runMigrations } from './run-migrations.mjs';

const testUrl = process.env.MIST_TEST_MYSQL_URL;
if (!testUrl) {
  throw new Error('MIST_TEST_MYSQL_URL is required');
}

const parsed = new URL(testUrl);
const connectionConfig = {
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
};
const suffix = `${process.pid}_${Date.now()}`;
const databases = {
  full: `mist_strategy_contract_full_${suffix}`,
  partial: `mist_strategy_contract_partial_${suffix}`,
  blocked: `mist_strategy_contract_blocked_${suffix}`,
};
for (const database of Object.values(databases)) {
  assert.match(database, /^[a-z0-9_]+$/);
}

const admin = await mysql.createConnection({
  ...connectionConfig,
  multipleStatements: true,
});
const baselineDir = await mkdtemp(
  join(tmpdir(), 'mist-strategy-migrations-001-013-'),
);

try {
  await copyBaselineMigrations(baselineDir);
  for (const database of Object.values(databases)) {
    await admin.query(`CREATE DATABASE \`${database}\``);
  }

  await runMigrations({ env: migrationEnv(databases.full) });
  await assertTargetSchema(databases.full);
  await assertRestrictiveSecurityIdentity(databases.full);

  await runMigrations({
    env: migrationEnv(databases.partial),
    migrationDir: baselineDir,
  });
  const partial = await openDatabase(databases.partial);
  try {
    await partial.query(
      "ALTER TABLE `strategy_versions` ADD COLUMN `signal_kind` enum('entry','exit') NOT NULL AFTER `rule`",
    );
  } finally {
    await partial.end();
  }
  await runMigrations({ env: migrationEnv(databases.partial) });
  await assertTargetSchema(databases.partial);

  await runMigrations({
    env: migrationEnv(databases.blocked),
    migrationDir: baselineDir,
  });
  const blocked = await openDatabase(databases.blocked);
  try {
    await blocked.query(
      `INSERT INTO strategy_definitions
        (name, status, target_universe, periods, sources)
       VALUES ('blocked migration proof', 'draft', JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY())`,
    );
  } finally {
    await blocked.end();
  }
  await assert.rejects(
    runMigrations({ env: migrationEnv(databases.blocked) }),
    /strategy_evaluation_migration_requires_zero_rows_and_exact_schema_state/,
  );
  await assertMigrationNotRecorded(databases.blocked);

  console.log(
    'Strategy evaluation migration passed full, repair-forward, zero-data and restrictive-FK tests.',
  );
} finally {
  for (const database of Object.values(databases)) {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
  await admin.end();
  await rm(baselineDir, { recursive: true, force: true });
}

function migrationEnv(database) {
  return {
    mysql_server_host: connectionConfig.host,
    mysql_server_port: String(connectionConfig.port),
    mysql_server_username: connectionConfig.user,
    mysql_server_password: connectionConfig.password,
    mysql_server_database: database,
  };
}

async function openDatabase(database) {
  return await mysql.createConnection({
    ...connectionConfig,
    database,
    multipleStatements: true,
  });
}

async function copyBaselineMigrations(destination) {
  const source = join(process.cwd(), 'deploy/database/migrations');
  const files = (await readdir(source))
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 3)) <= 13);
  assert.equal(files.length, 13);
  for (const file of files) {
    await copyFile(join(source, file), join(destination, basename(file)));
  }
}

async function assertTargetSchema(database) {
  const connection = await openDatabase(database);
  try {
    const [columns] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND (
           (TABLE_NAME = 'strategy_versions' AND COLUMN_NAME = 'signal_kind') OR
           (TABLE_NAME = 'strategy_signals' AND COLUMN_NAME IN ('security_code', 'security_id', 'signal_kind'))
         )
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    );
    assert.deepEqual(
      columns.map((row) => ({
        table: row.TABLE_NAME,
        column: row.COLUMN_NAME,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE,
        defaultValue: row.COLUMN_DEFAULT,
      })),
      [
        {
          table: 'strategy_signals',
          column: 'security_id',
          type: 'int',
          nullable: 'NO',
          defaultValue: null,
        },
        {
          table: 'strategy_signals',
          column: 'signal_kind',
          type: "enum('entry','exit')",
          nullable: 'NO',
          defaultValue: null,
        },
        {
          table: 'strategy_versions',
          column: 'signal_kind',
          type: "enum('entry','exit')",
          nullable: 'NO',
          defaultValue: null,
        },
      ],
    );

    const [foreignKeys] = await connection.query(
      `SELECT usage_rows.COLUMN_NAME, usage_rows.REFERENCED_TABLE_NAME,
              usage_rows.REFERENCED_COLUMN_NAME, reference_rows.DELETE_RULE,
              reference_rows.UPDATE_RULE
       FROM information_schema.KEY_COLUMN_USAGE AS usage_rows
       JOIN information_schema.REFERENTIAL_CONSTRAINTS AS reference_rows
         ON reference_rows.CONSTRAINT_SCHEMA = usage_rows.CONSTRAINT_SCHEMA
        AND reference_rows.TABLE_NAME = usage_rows.TABLE_NAME
        AND reference_rows.CONSTRAINT_NAME = usage_rows.CONSTRAINT_NAME
       WHERE usage_rows.CONSTRAINT_SCHEMA = ?
         AND usage_rows.TABLE_NAME = 'strategy_signals'
         AND usage_rows.CONSTRAINT_NAME = 'fk_strategy_signals_security'`,
      [database],
    );
    assert.deepEqual(foreignKeys, [
      {
        COLUMN_NAME: 'security_id',
        REFERENCED_TABLE_NAME: 'securities',
        REFERENCED_COLUMN_NAME: 'id',
        DELETE_RULE: 'RESTRICT',
        UPDATE_RULE: 'RESTRICT',
      },
    ]);

    const [ledger] = await connection.query(
      `SELECT version FROM schema_migrations
       WHERE version = '014_evolve_strategy_evaluation_contract.sql'`,
    );
    assert.deepEqual(ledger, [
      { version: '014_evolve_strategy_evaluation_contract.sql' },
    ]);
  } finally {
    await connection.end();
  }
}

async function assertRestrictiveSecurityIdentity(database) {
  const connection = await openDatabase(database);
  try {
    const [securityResult] = await connection.query(
      `INSERT INTO securities (code, name, type, status)
       VALUES ('999999', 'Strategy FK proof', 'STOCK', 1)`,
    );
    const securityId = securityResult.insertId;
    const [definitionResult] = await connection.query(
      `INSERT INTO strategy_definitions
        (name, status, target_universe, periods, sources)
       VALUES ('Strategy FK proof', 'draft', JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY())`,
    );
    const definitionId = definitionResult.insertId;
    const [versionResult] = await connection.query(
      `INSERT INTO strategy_versions
        (strategy_definition_id, version_number, rule_schema_version, rule,
         signal_kind, validation_summary)
       VALUES (?, 1, 'v1', JSON_OBJECT(), 'entry', JSON_OBJECT())`,
      [definitionId],
    );
    const versionId = versionResult.insertId;
    await connection.query(
      `UPDATE strategy_definitions SET current_version_id = ? WHERE id = ?`,
      [versionId, definitionId],
    );
    await connection.query(
      `INSERT INTO strategy_signals
        (strategy_definition_id, strategy_version_id, security_id, period,
         source, signal_time, signal_source, signal_kind, context_snapshot,
         rule_snapshot)
       VALUES (?, ?, ?, 1440, 'tdx', '2026-08-04 09:31:00', 'live', 'entry',
               JSON_OBJECT(), JSON_OBJECT())`,
      [definitionId, versionId, securityId],
    );

    await assert.rejects(
      connection.query('DELETE FROM securities WHERE id = ?', [securityId]),
      (error) => error?.code === 'ER_ROW_IS_REFERENCED_2',
    );
    await assert.rejects(
      connection.query('UPDATE securities SET id = id + 1000 WHERE id = ?', [
        securityId,
      ]),
      (error) => error?.code === 'ER_ROW_IS_REFERENCED_2',
    );
  } finally {
    await connection.end();
  }
}

async function assertMigrationNotRecorded(database) {
  const connection = await openDatabase(database);
  try {
    const [ledger] = await connection.query(
      `SELECT version FROM schema_migrations
       WHERE version = '014_evolve_strategy_evaluation_contract.sql'`,
    );
    assert.deepEqual(ledger, []);
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME IN ('strategy_versions', 'strategy_signals')
         AND COLUMN_NAME IN ('signal_kind', 'security_id')`,
      [database],
    );
    assert.deepEqual(columns, []);
  } finally {
    await connection.end();
  }
}
