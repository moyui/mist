import { DataSource } from 'typeorm';
import {
  IndexDaily,
  IndexData,
  IndexPeriod,
  Stock,
  StockSourceFormat,
  KLine,
  KlineExtensionEf,
  KlineExtensionTdx,
  KlineExtensionMqmt,
} from '../entities';
import { configService } from '../config';

export async function runMultiDataSourceKlineMigration() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: configService.get('mysql_server_host') || 'localhost',
    port: configService.get('mysql_server_port') || 3306,
    username: configService.get('mysql_server_username') || 'root',
    password:
      configService.get('mysql_server_password') || 'your_secure_password_here',
    database: configService.get('mysql_server_database') || 'mist',
    synchronize: false,
    logging: true,
    entities: [
      IndexDaily,
      IndexData,
      IndexPeriod,
      Stock,
      StockSourceFormat,
      KLine,
      KlineExtensionEf,
      KlineExtensionTdx,
      KlineExtensionMqmt,
    ],
    poolSize: 10,
    connectorPackage: 'mysql2',
    extra: {
      authPlugins: 'sha256_password',
    },
  });

  await dataSource.initialize();
  await dataSource.query(`
    -- Create KlineExtensionEf table
    CREATE TABLE IF NOT EXISTS \`k_line_extensions_ef\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`k_line_id\` int NOT NULL COMMENT 'Reference to K-Line record',
      \`amplitude\` decimal(10,2) NULL COMMENT '振幅（%）',
      \`changePct\` decimal(10,2) NULL COMMENT '涨跌幅（%）',
      \`changeAmt\` decimal(10,2) NULL COMMENT '涨跌额（元）',
      \`turnoverRate\` decimal(10,2) NULL COMMENT '换手率（%）',
      \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UNIQ_k_line_id\` (\`k_line_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await dataSource.query(`
    -- Create KlineExtensionTdx table
    CREATE TABLE IF NOT EXISTS \`k_line_extensions_tdx\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`k_line_id\` int NOT NULL COMMENT 'Reference to K-Line record',
      \`forwardFactor\` decimal(12,6) NULL COMMENT '前复权因子：用于处理复权数据',
      \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UNIQ_k_line_id\` (\`k_line_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await dataSource.query(`
    -- Create KlineExtensionMqmt table
    CREATE TABLE IF NOT EXISTS \`k_line_extensions_mqmt\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`k_line_id\` int NOT NULL COMMENT 'Reference to K-Line record',
      \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`UNIQ_k_line_id\` (\`k_line_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await dataSource.destroy();
  console.log('MultiDataSourceKline migration completed successfully');
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMultiDataSourceKlineMigration().catch(console.error);
}
