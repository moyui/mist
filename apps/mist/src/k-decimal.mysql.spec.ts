import { RowDataPacket } from 'mysql2';
import { createConnection } from 'mysql2/promise';

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
}

interface DecimalRow extends RowDataPacket {
  volume: string | null;
  amount: string | null;
}

const mysqlUrl = process.env.MIST_TEST_MYSQL_URL;
const describeWithTestMySQL = mysqlUrl ? describe : describe.skip;

describeWithTestMySQL('K exact decimal real MySQL gate', () => {
  it('has nullable DECIMAL(36,8) volume and amount columns', async () => {
    if (!mysqlUrl) throw new Error('MIST_TEST_MYSQL_URL is required');
    const connection = await createConnection(mysqlUrl);
    try {
      const [rows] = await connection.query<ColumnRow[]>(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'k'
            AND COLUMN_NAME IN ('volume', 'amount')
          ORDER BY COLUMN_NAME`,
      );
      expect(rows).toEqual([
        {
          COLUMN_NAME: 'amount',
          COLUMN_TYPE: 'decimal(36,8)',
          IS_NULLABLE: 'YES',
        },
        {
          COLUMN_NAME: 'volume',
          COLUMN_TYPE: 'decimal(36,8)',
          IS_NULLABLE: 'YES',
        },
      ]);
    } finally {
      await connection.end();
    }
  });

  it('round-trips exact decimals, zero, and null without coercion', async () => {
    if (!mysqlUrl) throw new Error('MIST_TEST_MYSQL_URL is required');
    const connection = await createConnection(mysqlUrl);
    try {
      await connection.query(
        `CREATE TEMPORARY TABLE mist_k_decimal_roundtrip (
           id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
           volume decimal(36,8) NULL,
           amount decimal(36,8) NULL
         )`,
      );
      await connection.execute(
        `INSERT INTO mist_k_decimal_roundtrip (volume, amount)
         VALUES (?, ?), (?, ?), (?, ?)`,
        [
          '1234.56789012',
          '99999999999999999999.12345678',
          '0',
          '0',
          null,
          null,
        ],
      );
      const [rows] = await connection.query<DecimalRow[]>(
        `SELECT volume, amount
           FROM mist_k_decimal_roundtrip
          ORDER BY id`,
      );
      expect(rows).toEqual([
        {
          volume: '1234.56789012',
          amount: '99999999999999999999.12345678',
        },
        { volume: '0.00000000', amount: '0.00000000' },
        { volume: null, amount: null },
      ]);
    } finally {
      await connection.end();
    }
  });
});
