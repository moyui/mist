import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiDataSourceKline1721567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create KLineExtensionEF table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`k_line_extensions_ef\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`source\` enum ('ef', 'tdx', 'mqmt') NOT NULL DEFAULT 'ef' COMMENT '数据源：ef=东方财富',
        \`period\` enum ('1min', '5min', '15min', '30min', '60min', 'daily') NOT NULL COMMENT 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
        \`timestamp\` datetime NOT NULL COMMENT 'K线时间戳',
        \`amplitude\` double NOT NULL COMMENT '振幅：(最高价-最低价)/昨收*100',
        \`changePct\` double(12,4) NOT NULL COMMENT '涨跌幅：(收盘价-昨收)/昨收*100',
        \`changeAmt\` decimal(12,2) NOT NULL COMMENT '涨跌额：收盘价-昨收',
        \`turnoverRate\` double(12,4) NOT NULL COMMENT '换手率：成交量/流通股本*100',
        \`prevClose\` double(12,2) NOT NULL COMMENT '昨收：昨天的收盘价',
        \`open\` double(12,2) NOT NULL COMMENT '今开：今天的开盘价',
        \`high\` double(12,2) NOT NULL COMMENT '最高价',
        \`low\` double(12,2) NOT NULL COMMENT '最低价',
        \`close\` double(12,2) NOT NULL COMMENT '收盘价',
        \`volume\` bigint NOT NULL COMMENT '成交量',
        \`amount\` double(12,2) NOT NULL COMMENT '成交额',
        \`tradeCount\` bigint NOT NULL COMMENT '成交笔数',
        \`floatShare\` bigint NOT NULL COMMENT '流通股本',
        \`totalShare\` bigint NOT NULL COMMENT '总股本',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_amplitude\` (\`amplitude\`),
        INDEX \`IDX_changePct\` (\`changePct\`),
        INDEX \`IDX_changeAmt\` (\`changeAmt\`),
        INDEX \`IDX_turnoverRate\` (\`turnoverRate\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create KLineExtensionTDX table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`k_line_extensions_tdx\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`source\` enum ('ef', 'tdx', 'mqmt') NOT NULL DEFAULT 'tdx' COMMENT '数据源：tdx=通达信',
        \`period\` enum ('1min', '5min', '15min', '30min', '60min', 'daily') NOT NULL COMMENT 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
        \`timestamp\` datetime NOT NULL COMMENT 'K线时间戳',
        \`forwardFactor\` double(12,6) NOT NULL COMMENT '前复因子：用于处理复权数据',
        \`open\` double(12,2) NOT NULL COMMENT '开盘价',
        \`high\` double(12,2) NOT NULL COMMENT '最高价',
        \`low\` double(12,2) NOT NULL COMMENT '最低价',
        \`close\` double(12,2) NOT NULL COMMENT '收盘价',
        \`volume\` bigint NOT NULL COMMENT '成交量',
        \`amount\` double(12,2) NOT NULL COMMENT '成交额',
        \`tradeCount\` bigint NOT NULL COMMENT '成交笔数',
        \`changePct\` double(12,4) NOT NULL COMMENT '涨跌幅：(收盘价-昨收)/昨收*100',
        \`changeAmt\` double(12,2) NOT NULL COMMENT '涨跌额：收盘价-昨收',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_forwardFactor\` (\`forwardFactor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create KLineExtensionMQMT table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`k_line_extensions_mqmt\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`source\` enum ('ef', 'tdx', 'mqmt') NOT NULL DEFAULT 'mqmt' COMMENT '数据源：mqmt=miniQMT',
        \`period\` enum ('1min', '5min', '15min', '30min', '60min', 'daily') NOT NULL COMMENT 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
        \`timestamp\` datetime NOT NULL COMMENT 'K线时间戳',
        \`open\` double(12,2) NOT NULL COMMENT '开盘价',
        \`high\` double(12,2) NOT NULL COMMENT '最高价',
        \`low\` double(12,2) NOT NULL COMMENT '最低价',
        \`close\` double(12,2) NOT NULL COMMENT '收盘价',
        \`volume\` bigint NOT NULL COMMENT '成交量',
        \`amount\` double(12,2) NOT NULL COMMENT '成交额',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
        \`metadata\` json COMMENT 'Additional MQMT-specific metadata (placeholder for future use)',
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_mqmt\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_tdx\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`k_line_extensions_ef\``);
  }
}