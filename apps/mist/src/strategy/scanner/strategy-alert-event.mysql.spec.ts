import { RowDataPacket } from 'mysql2';
import { createConnection } from 'mysql2/promise';

interface IndexRow extends RowDataPacket {
  INDEX_NAME: string;
  NON_UNIQUE: number;
  COLUMN_NAME: string;
}

const mysqlUrl = process.env.MIST_TEST_MYSQL_URL;
const describeWithTestMySQL = mysqlUrl ? describe : describe.skip;

describeWithTestMySQL('StrategyAlertEvent real MySQL schema gate', () => {
  it('has the named unique dedupe index in the configured test database', async () => {
    if (!mysqlUrl) throw new Error('MIST_TEST_MYSQL_URL is required');
    const connection = await createConnection(mysqlUrl);
    try {
      const [rows] = await connection.query<IndexRow[]>(
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'strategy_alert_events'
            AND INDEX_NAME = 'uq_strategy_alert_events_dedupe_key'
          ORDER BY SEQ_IN_INDEX`,
      );

      expect(rows).toEqual([
        {
          INDEX_NAME: 'uq_strategy_alert_events_dedupe_key',
          NON_UNIQUE: 0,
          COLUMN_NAME: 'dedupe_key',
        },
      ]);
    } finally {
      await connection.end();
    }
  });
});
