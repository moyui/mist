import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifiedDataSchema21000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Create new unified data schema tables

      -- Securities table
      CREATE TABLE \`securities\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(20) NOT NULL COMMENT '纯代码，如 000001, 000300',
        \`name\` VARCHAR(100) NOT NULL COMMENT '证券名称',
        \`type\` ENUM('STOCK', 'INDEX') NOT NULL COMMENT '证券类型：STOCK=股票，INDEX=指数',
        \`exchange\` VARCHAR(10) NOT NULL COMMENT '交易所：SH=上交所，SZ=深交所，CSI=中证指数',
        \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1=正常，0=停牌，-1=退市/终止',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX \`UQ_securities_code\` (\`code\`),
        PRIMARY INDEX \`PK_securities\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      -- Security source configurations table
      CREATE TABLE \`security_source_configs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`security_id\` INT NOT NULL,
        \`source\` ENUM('ef', 'tdx', 'mqmt') NOT NULL COMMENT '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
        \`enabled\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`priority\` TINYINT NOT NULL DEFAULT 0 COMMENT '优先级，0=最高',
        \`config\` JSON NULL COMMENT '额外配置信息',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`IDX_security_source_configs_security_id\` (\`security_id\`),
        INDEX \`IDX_security_source_configs_source\` (\`source\`),
        PRIMARY INDEX \`PK_security_source_configs\` (\`id\`),
        CONSTRAINT \`FK_security_source_configs_securities\` FOREIGN KEY (\`security_id\`) REFERENCES \`securities\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      -- Market data bars table
      CREATE TABLE \`market_data_bars\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`security_id\` INT NOT NULL,
        \`source\` ENUM('ef', 'tdx', 'mqmt') NOT NULL COMMENT '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
        \`period\` ENUM('1min', '5min', '15min', '30min', '60min', 'daily') NOT NULL COMMENT 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
        \`timestamp\` DATETIME NOT NULL COMMENT 'K线时间戳',
        \`open\` DECIMAL(12,2) NOT NULL COMMENT '开盘价',
        \`high\` DECIMAL(12,2) NOT NULL COMMENT '最高价',
        \`low\` DECIMAL(12,2) NOT NULL COMMENT '最低价',
        \`close\` DECIMAL(12,2) NOT NULL COMMENT '收盘价',
        \`volume\` BIGINT NOT NULL COMMENT '成交量',
        \`amount\` DOUBLE NOT NULL COMMENT '成交额',
        \`extension_ef_id\` INT NULL,
        \`extension_tdx_id\` INT NULL,
        \`extension_mqmt_id\` INT NULL,
        \`market_extension_ef_id\` INT NULL,
        \`market_extension_tdx_id\` INT NULL,
        \`market_extension_mqmt_id\` INT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX \`UQ_market_data_bars_security_source_period_timestamp\` (\`security_id\`, \`source\`, \`period\`, \`timestamp\`),
        INDEX \`IDX_market_data_bars_security_id\` (\`security_id\`),
        INDEX \`IDX_market_data_bars_source\` (\`source\`),
        INDEX \`IDX_market_data_bars_period\` (\`period\`),
        INDEX \`IDX_market_data_bars_timestamp\` (\`timestamp\`),
        PRIMARY INDEX \`PK_market_data_bars\` (\`id\`),
        CONSTRAINT \`FK_market_data_bars_securities\` FOREIGN KEY (\`security_id\`) REFERENCES \`securities\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      -- Market data extensions for East Money table
      CREATE TABLE \`market_data_extensions_ef\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`volume_precision\` TINYINT NULL COMMENT '成交量精度',
        \`price_precision\` TINYINT NULL COMMENT '价格精度',
        \`price_factor\` INT NULL COMMENT '价格因子',
        \`volume_factor\` INT NULL COMMENT '成交量因子',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY INDEX \`PK_market_data_extensions_ef\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      -- Market data extensions for TDX table
      CREATE TABLE \`market_data_extensions_tdx\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`volume_precision\` TINYINT NULL COMMENT '成交量精度',
        \`price_precision\` TINYINT NULL COMMENT '价格精度',
        \`price_factor\` INT NULL COMMENT '价格因子',
        \`volume_factor\` INT NULL COMMENT '成交量因子',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY INDEX \`PK_market_data_extensions_tdx\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      -- Market data extensions for MiniQMT table
      CREATE TABLE \`market_data_extensions_mqmt\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`volume_precision\` TINYINT NULL COMMENT '成交量精度',
        \`price_precision\` TINYINT NULL COMMENT '价格精度',
        \`price_factor\` INT NULL COMMENT '价格因子',
        \`volume_factor\` INT NULL COMMENT '成交量因子',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY INDEX \`PK_market_data_extensions_mqmt\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Drop old tables (in reverse dependency order)
    const tablesToDrop = [
      'k_line_extensions_ef',
      'k_line_extensions_tdx',
      'k_line_extensions_mqmt',
      'k_lines',
      'stock_source_formats',
      'stocks',
      'index_dailies',
      'index_periods',
      'index_datas'
    ];

    for (const tableName of tablesToDrop) {
      try {
        await queryRunner.query(\`DROP TABLE IF EXISTS \${tableName}\`);
        console.log(\`Dropped table: \${tableName}\`);
      } catch (error) {
        console.log(\`Error dropping table \${tableName}: \${error.message}\`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate old tables (simplified structure for rollback)
    const tablesToRecreate = [
      {
        name: 'index_datas',
        columns: [
          'id INT NOT NULL AUTO_INCREMENT',
          'name VARCHAR(50) NOT NULL',
          'symbol VARCHAR(50) NOT NULL',
          'type ENUM(1, 2, 3) NOT NULL',
          'create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
          'update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
          'PRIMARY KEY (id)',
          'UNIQUE KEY uk_symbol (symbol)'
        ]
      },
      {
        name: 'index_periods',
        columns: [
          'id INT NOT NULL AUTO_INCREMENT',
          'time VARCHAR(50) NOT NULL',
          'open DECIMAL(12,2) NOT NULL',
          'close DECIMAL(12,2) NOT NULL',
          'highest DECIMAL(12,2) NOT NULL',
          'lowest DECIMAL(12,2) NOT NULL',
          'volume BIGINT NOT NULL',
          'amount DOUBLE NOT NULL',
          'type ENUM(5, 15, 30, 60) NOT NULL',
          'index_id INT NOT NULL',
          'create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
          'update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
          'PRIMARY KEY (id)',
          'KEY idx_index_id (index_id)'
        ]
      },
      {
        name: 'stocks',
        columns: [
          'id INT NOT NULL AUTO_INCREMENT',
          'symbol VARCHAR(50) NOT NULL',
          'name VARCHAR(100) NOT NULL',
          'type VARCHAR(20) NOT NULL',
          'exchange VARCHAR(10) NOT NULL',
          'create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
          'update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
          'PRIMARY KEY (id)',
          'UNIQUE KEY uk_symbol (symbol)'
        ]
      }
    ];

    for (const table of tablesToRecreate) {
      try {
        await queryRunner.query(\`DROP TABLE IF EXISTS \${table.name}\`);
        const columnDefs = table.columns.join(', ');
        await queryRunner.query(\`CREATE TABLE \${table.name} ( \${columnDefs} ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`);
        console.log(\`Recreated table: \${table.name}\`);
      } catch (error) {
        console.log(\`Error recreating table \${table.name}: \${error.message}\`);
      }
    }

    // Drop new tables
    const newTables = [
      'market_data_extensions_mqmt',
      'market_data_extensions_tdx',
      'market_data_extensions_ef',
      'market_data_bars',
      'security_source_configs',
      'securities'
    ];

    for (const tableName of newTables) {
      try {
        await queryRunner.query(\`DROP TABLE IF EXISTS \${tableName}\`);
        console.log(\`Dropped table: \${tableName}\`);
      } catch (error) {
        console.log(\`Error dropping table \${tableName}: \${error.message}\`);
      }
    }
  }
}