import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiDataSourceKline1721567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create KlineExtensionEf table
    await queryRunner.query(`
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

    // Create KlineExtensionTdx table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`k_line_extensions_tdx\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`k_line_id\` int NOT NULL COMMENT 'Reference to K-Line record',
        \`forwardFactor\` decimal(12,6) NULL COMMENT '前复权因子：用于处理复权数据',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_k_line_id\` (\`k_line_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create KlineExtensionMqmt table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`k_line_extensions_mqmt\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`k_line_id\` int NOT NULL COMMENT 'Reference to K-Line record',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Create Time',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UNIQ_k_line_id\` (\`k_line_id\`)
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
