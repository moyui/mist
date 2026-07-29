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

  it.each([
    ['NaN', { open: Number.NaN }],
    ['positive infinity', { high: Number.POSITIVE_INFINITY }],
    ['negative infinity', { low: Number.NEGATIVE_INFINITY }],
    ['missing value', { close: undefined }],
    ['non-number value', { open: '10.5' }],
  ])(
    'rejects a %s required price before creating or inserting K rows',
    async (_caseName, invalidPrice) => {
      const timestamp = new Date('2026-07-04T09:30:00.000Z');
      const manager = {
        create: jest.fn(),
        createQueryBuilder: jest.fn(() => insertBuilder),
        find: jest.fn(),
      } as any;

      await expect(
        saveBaseK(
          manager,
          [
            {
              timestamp,
              open: 10,
              high: 11,
              low: 9,
              close: 10.5,
              volume: null,
              amount: null,
              ...invalidPrice,
            } as any,
          ],
          { id: 42 } as Security,
          DataSource.TDX,
          Period.ONE_MIN,
        ),
      ).rejects.toThrow(
        /Invalid required K prices at row 0 \(timestamp=2026-07-04T09:30:00.000Z\): .* must be finite numbers/,
      );

      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
      expect(insertBuilder.execute).not.toHaveBeenCalled();
    },
  );

  it('accepts explicit numeric zero for every required price', async () => {
    const timestamp = new Date('2026-07-04T09:30:00.000Z');
    const savedK = Object.assign(new K(), { id: 8, timestamp });
    const manager = {
      create: jest.fn((entity, payload) =>
        Object.assign(new entity(), payload),
      ),
      createQueryBuilder: jest.fn(() => insertBuilder),
      find: jest.fn().mockResolvedValue([savedK]),
    } as any;

    await expect(
      saveBaseK(
        manager,
        [
          {
            timestamp,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: null,
            amount: null,
          },
        ],
        { id: 42 } as Security,
        DataSource.QMT,
        Period.DAY,
      ),
    ).resolves.toEqual(new Map([[timestamp.getTime(), savedK]]));

    expect(insertBuilder.execute).toHaveBeenCalledTimes(1);
  });
});
