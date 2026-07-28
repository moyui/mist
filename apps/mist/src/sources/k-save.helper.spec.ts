import { DataSource, K, Period, Security } from '@app/shared-data';
import {
  K_CONFLICT_COLUMNS,
  K_UPSERT_COLUMNS,
  saveBaseK,
} from './k-save.helper';

const insertBuilder = {
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  updateEntity: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
};

describe('saveBaseK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts base K rows once and returns saved rows by timestamp', async () => {
    const timestamp = new Date('2026-07-04T09:30:00.000Z');
    const savedK = Object.assign(new K(), { id: 7, timestamp });
    const manager = {
      create: jest.fn((entity, payload) =>
        Object.assign(new entity(), payload),
      ),
      createQueryBuilder: jest.fn(() => insertBuilder),
      find: jest.fn().mockResolvedValue([savedK]),
    } as any;
    const security = { id: 42 } as Security;

    const saved = await saveBaseK(
      manager,
      [
        {
          timestamp,
          open: 10,
          high: 11,
          low: 9,
          close: 10.5,
          volume: '1234.2',
          amount: null,
        },
      ],
      security,
      DataSource.TDX,
      Period.ONE_MIN,
    );

    expect(insertBuilder.into).toHaveBeenCalledWith(K);
    expect(insertBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        securityId: 42,
        source: DataSource.TDX,
        period: Period.ONE_MIN,
        timestamp,
        volume: '1234.2',
        amount: null,
      }),
    ]);
    expect(insertBuilder.orUpdate).toHaveBeenCalledWith(
      K_UPSERT_COLUMNS,
      K_CONFLICT_COLUMNS,
    );
    expect(manager.find).toHaveBeenCalledWith(K, {
      where: {
        security: { id: 42 },
        source: DataSource.TDX,
        period: Period.ONE_MIN,
        timestamp: expect.any(Object),
      },
    });
    expect(saved.get(timestamp.getTime())).toBe(savedK);
  });
});
