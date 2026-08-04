import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import mysql from 'mysql2/promise';
import { runMigrations } from './run-migrations.mjs';

const testUrl = process.env.MIST_TEST_MYSQL_URL;
if (!testUrl) throw new Error('MIST_TEST_MYSQL_URL is required');

const parsed = new URL(testUrl);
const connectionConfig = {
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
};
const suffix = `${process.pid}_${Date.now()}`;
const databases = {
  full: `mist_realtime_assignment_full_${suffix}`,
  partial: `mist_realtime_assignment_partial_${suffix}`,
  blocked: `mist_realtime_assignment_blocked_${suffix}`,
};
const baselineDir = await mkdtemp(
  join(tmpdir(), 'mist-realtime-assignment-migrations-001-014-'),
);
const admin = await mysql.createConnection({
  ...connectionConfig,
  multipleStatements: true,
});

try {
  await copyMigrationsThrough(baselineDir, 14);
  for (const database of Object.values(databases)) {
    assert.match(database, /^[a-z0-9_]+$/);
    await admin.query(`CREATE DATABASE \`${database}\``);
  }

  await runMigrations({ env: migrationEnv(databases.full) });
  await assertTargetSchema(databases.full);
  await assertRestrictiveAssignmentIdentity(databases.full);

  await runMigrations({
    env: migrationEnv(databases.partial),
    migrationDir: baselineDir,
  });
  const partial = await openDatabase(databases.partial);
  try {
    await partial.query(
      'ALTER TABLE `security_source_configs` ADD UNIQUE KEY `uq_security_source_configs_id_security` (`id`,`security_id`), ADD KEY `idx_security_source_configs_source` (`source`)',
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
      'CREATE TABLE `realtime_subscription_assignments` (`id` int NOT NULL PRIMARY KEY) ENGINE=InnoDB',
    );
  } finally {
    await blocked.end();
  }
  await assert.rejects(
    runMigrations({ env: migrationEnv(databases.blocked) }),
    /realtime_assignment_migration_requires_exact_known_schema_state/,
  );
  await assertMigrationNotRecorded(databases.blocked);

  console.log(
    'Realtime assignment migration passed full, repair-forward, fail-closed and restrictive-constraint tests.',
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

async function copyMigrationsThrough(destination, maximum) {
  const source = join(process.cwd(), 'deploy/database/migrations');
  const files = (await readdir(source))
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 3)) <= maximum);
  assert.equal(files.length, maximum);
  for (const file of files) {
    await copyFile(join(source, file), join(destination, basename(file)));
  }
}

async function assertTargetSchema(database) {
  const connection = await openDatabase(database);
  try {
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'realtime_subscription_assignments'
       ORDER BY ORDINAL_POSITION`,
      [database],
    );
    assert.deepEqual(
      columns.map((row) => [row.COLUMN_NAME, row.COLUMN_TYPE, row.IS_NULLABLE]),
      [
        ['id', 'int', 'NO'],
        ['security_id', 'int', 'NO'],
        ['source_config_id', 'int', 'NO'],
        ['created_at', 'datetime(6)', 'NO'],
        ['updated_at', 'datetime(6)', 'NO'],
      ],
    );

    const [indexes] = await connection.query(
      `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'realtime_subscription_assignments'
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [database],
    );
    assert.equal(indexes.length, 5);
    assert.deepEqual(
      indexes.map((row) => [
        row.INDEX_NAME,
        Number(row.NON_UNIQUE),
        Number(row.SEQ_IN_INDEX),
        row.COLUMN_NAME,
      ]),
      [
        [
          'idx_realtime_subscription_assignments_source_security',
          1,
          1,
          'source_config_id',
        ],
        [
          'idx_realtime_subscription_assignments_source_security',
          1,
          2,
          'security_id',
        ],
        ['PRIMARY', 0, 1, 'id'],
        ['uq_realtime_subscription_assignments_security', 0, 1, 'security_id'],
        [
          'uq_realtime_subscription_assignments_source_config',
          0,
          1,
          'source_config_id',
        ],
      ],
    );

    const [sourceIndexes] = await connection.query(
      `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'security_source_configs'
         AND INDEX_NAME IN (
           'uq_security_source_configs_id_security',
           'idx_security_source_configs_source'
         )
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [database],
    );
    assert.deepEqual(
      sourceIndexes.map((row) => [
        row.INDEX_NAME,
        Number(row.NON_UNIQUE),
        Number(row.SEQ_IN_INDEX),
        row.COLUMN_NAME,
      ]),
      [
        ['idx_security_source_configs_source', 1, 1, 'source'],
        ['uq_security_source_configs_id_security', 0, 1, 'id'],
        ['uq_security_source_configs_id_security', 0, 2, 'security_id'],
      ],
    );

    const [foreignKeys] = await connection.query(
      `SELECT usage_rows.CONSTRAINT_NAME, usage_rows.ORDINAL_POSITION,
              usage_rows.COLUMN_NAME, usage_rows.REFERENCED_TABLE_NAME,
              usage_rows.REFERENCED_COLUMN_NAME, reference_rows.DELETE_RULE,
              reference_rows.UPDATE_RULE
       FROM information_schema.KEY_COLUMN_USAGE AS usage_rows
       JOIN information_schema.REFERENTIAL_CONSTRAINTS AS reference_rows
         ON reference_rows.CONSTRAINT_SCHEMA = usage_rows.CONSTRAINT_SCHEMA
        AND reference_rows.TABLE_NAME = usage_rows.TABLE_NAME
        AND reference_rows.CONSTRAINT_NAME = usage_rows.CONSTRAINT_NAME
       WHERE usage_rows.CONSTRAINT_SCHEMA = ?
         AND usage_rows.TABLE_NAME = 'realtime_subscription_assignments'
       ORDER BY usage_rows.CONSTRAINT_NAME, usage_rows.ORDINAL_POSITION`,
      [database],
    );
    assert.deepEqual(
      foreignKeys.map((row) => [
        row.CONSTRAINT_NAME,
        Number(row.ORDINAL_POSITION),
        row.COLUMN_NAME,
        row.REFERENCED_TABLE_NAME,
        row.REFERENCED_COLUMN_NAME,
        row.DELETE_RULE,
        row.UPDATE_RULE,
      ]),
      [
        [
          'fk_realtime_subscription_assignments_security',
          1,
          'security_id',
          'securities',
          'id',
          'RESTRICT',
          'RESTRICT',
        ],
        [
          'fk_realtime_subscription_assignments_source_config',
          1,
          'source_config_id',
          'security_source_configs',
          'id',
          'RESTRICT',
          'RESTRICT',
        ],
        [
          'fk_realtime_subscription_assignments_source_config',
          2,
          'security_id',
          'security_source_configs',
          'security_id',
          'RESTRICT',
          'RESTRICT',
        ],
      ],
    );

    const [ledger] = await connection.query(
      `SELECT version FROM schema_migrations
       WHERE version = '015_add_realtime_subscription_assignments.sql'`,
    );
    assert.deepEqual(ledger, [
      { version: '015_add_realtime_subscription_assignments.sql' },
    ]);
  } finally {
    await connection.end();
  }
}

async function assertRestrictiveAssignmentIdentity(database) {
  const connection = await openDatabase(database);
  try {
    const [firstSecurity] = await connection.query(
      "INSERT INTO securities (code, name, type, status) VALUES ('900001', 'First', 'STOCK', 1)",
    );
    const [secondSecurity] = await connection.query(
      "INSERT INTO securities (code, name, type, status) VALUES ('900002', 'Second', 'STOCK', 1)",
    );
    const [firstSource] = await connection.query(
      "INSERT INTO security_source_configs (security_id, source, format_code, priority, enabled) VALUES (?, 'tdx', '900001.SH', 0, 1)",
      [firstSecurity.insertId],
    );
    const [secondSource] = await connection.query(
      "INSERT INTO security_source_configs (security_id, source, format_code, priority, enabled) VALUES (?, 'qmt', '900002.SH', 0, 1)",
      [secondSecurity.insertId],
    );
    await connection.query(
      'INSERT INTO realtime_subscription_assignments (security_id, source_config_id) VALUES (?, ?)',
      [firstSecurity.insertId, firstSource.insertId],
    );

    await assert.rejects(
      connection.query(
        'INSERT INTO realtime_subscription_assignments (security_id, source_config_id) VALUES (?, ?)',
        [firstSecurity.insertId, secondSource.insertId],
      ),
      (error) => error?.code === 'ER_DUP_ENTRY',
    );
    await assert.rejects(
      connection.query(
        'INSERT INTO realtime_subscription_assignments (security_id, source_config_id) VALUES (?, ?)',
        [secondSecurity.insertId, firstSource.insertId],
      ),
      (error) =>
        error?.code === 'ER_DUP_ENTRY' ||
        error?.code === 'ER_NO_REFERENCED_ROW_2',
    );
    await assert.rejects(
      connection.query('DELETE FROM security_source_configs WHERE id = ?', [
        firstSource.insertId,
      ]),
      (error) => error?.code === 'ER_ROW_IS_REFERENCED_2',
    );
    await assert.rejects(
      connection.query('DELETE FROM securities WHERE id = ?', [
        firstSecurity.insertId,
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
       WHERE version = '015_add_realtime_subscription_assignments.sql'`,
    );
    assert.deepEqual(ledger, []);
    const [sourceIndex] = await connection.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'security_source_configs'
         AND INDEX_NAME = 'uq_security_source_configs_id_security'`,
      [database],
    );
    assert.deepEqual(sourceIndex, []);
  } finally {
    await connection.end();
  }
}
