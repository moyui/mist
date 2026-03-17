import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMcpService } from './data-mcp.service';
import { IndexData } from '@app/shared-data';
import { IndexPeriod } from '@app/shared-data';
import { IndexDaily } from '@app/shared-data';

describe('DataMcpService', () => {
  let service: DataMcpService;
  let indexDataRepo: Repository<IndexData>;
  let indexPeriodRepo: Repository<IndexPeriod>;
  let indexDailyRepo: Repository<IndexDaily>;

  const mockIndexData = {
    id: 1,
    symbol: '000001',
    name: '上证指数',
    type: 'index',
    code: '000001',
    createTime: new Date(),
    updateTime: new Date(),
    indexPeriod: [],
    indexDaily: [],
  } as any;

  const mockIndexPeriod = {
    id: 1,
    time: '2024-01-01 09:30:00',
    type: 'ONE',
    open: 3000,
    close: 3010,
    highest: 3020,
    lowest: 2990,
    volume: 1000000,
    amount: 100000000,
    index_id: 1,
    indexData: null,
    createTime: new Date(),
    updateTime: new Date(),
  } as any;

  const mockIndexDaily = {
    id: 1,
    time: '2024-01-01',
    open: 3000,
    close: 3010,
    highest: 3020,
    lowest: 2990,
    volume: 1000000,
    amount: 100000000,
    index_id: 1,
    indexData: null,
    createTime: new Date(),
    updateTime: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMcpService,
        {
          provide: getRepositoryToken(IndexData),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(IndexPeriod),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(IndexDaily),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataMcpService>(DataMcpService);
    indexDataRepo = module.get<Repository<IndexData>>(
      getRepositoryToken(IndexData),
    );
    indexPeriodRepo = module.get<Repository<IndexPeriod>>(
      getRepositoryToken(IndexPeriod),
    );
    indexDailyRepo = module.get<Repository<IndexDaily>>(
      getRepositoryToken(IndexDaily),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getIndexInfo', () => {
    it('should return index info when found', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(mockIndexData);

      const result = (await service.getIndexInfo('000001')) as any;
      expect(result.success).toBe(true);
      expect(result.data.symbol).toBe('000001');
      expect(result.data.name).toBe('上证指数');
    });

    it('should return error when index not found', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(null);

      const result = (await service.getIndexInfo('999999')) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });

    it('should return error for empty symbol', async () => {
      const result = (await service.getIndexInfo('  ')) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('cannot be empty');
    });
  });

  describe('getKlineData', () => {
    it('should return kline data', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(mockIndexData);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockIndexPeriod]),
      };

      jest
        .spyOn(indexPeriodRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getKlineData('000001', 'ONE', 10)) as any;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data[0].time).toBe('2024-01-01 09:30:00');
    });

    it('should return error when index not found', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(null);

      const result = (await service.getKlineData('999999', 'ONE', 10)) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });

    it('should return error for invalid limit', async () => {
      const result = (await service.getKlineData('000001', 'ONE', 0)) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('limit must be at least 1');
    });

    it('should return error for invalid date range', async () => {
      const result = (await service.getKlineData(
        '000001',
        'ONE',
        10,
        '2024-12-31',
        '2024-01-01',
      )) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('start date');
    });
  });

  describe('getDailyKline', () => {
    it('should return daily kline data', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(mockIndexData);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockIndexDaily]),
      };

      jest
        .spyOn(indexDailyRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getDailyKline('000001', 10)) as any;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data[0].time).toBe('2024-01-01');
    });

    it('should return error when index not found', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(null);

      const result = (await service.getDailyKline('999999', 10)) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });
  });

  describe('listIndices', () => {
    it('should return all indices', async () => {
      jest.spyOn(indexDataRepo, 'find').mockResolvedValue([mockIndexData]);

      const result = (await service.listIndices()) as any;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data[0].symbol).toBe('000001');
    });
  });

  describe('getLatestData', () => {
    it('should return latest data for all periods', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(mockIndexData);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockIndexPeriod),
      };

      jest
        .spyOn(indexDailyRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(indexPeriodRepo, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getLatestData('000001')) as any;
      expect(result.success).toBe(true);
      expect(result.data.symbol).toBe('000001');
      expect(result.data.name).toBe('上证指数');
    });

    it('should return error when index not found', async () => {
      jest.spyOn(indexDataRepo, 'findOne').mockResolvedValue(null);

      const result = (await service.getLatestData('999999')) as any;
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });
  });
});
