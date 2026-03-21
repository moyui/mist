import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMcpService } from './data-mcp.service';
import { Security, K, KPeriod } from '@app/shared-data';

describe('DataMcpService', () => {
  let service: DataMcpService;
  let securityRepository: Repository<Security>;
  let kRepository: Repository<K>;

  const mockSecurity = {
    id: 1,
    code: '000001',
    name: '上证指数',
    type: 'INDEX',
    exchange: 'SH',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceConfigs: [],
    ks: [],
  } as any;

  const mockK = {
    id: 1,
    security: mockSecurity,
    source: 'aktools',
    period: '1min' as KPeriod,
    timestamp: new Date('2024-01-01T09:30:00Z'),
    open: 3000,
    close: 3010,
    high: 3020,
    low: 2990,
    volume: 1000000,
    amount: 100000000,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMcpService,
        {
          provide: getRepositoryToken(Security),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(K),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataMcpService>(DataMcpService);
    securityRepository = module.get<Repository<Security>>(
      getRepositoryToken(Security),
    );
    kRepository = module.get<Repository<K>>(getRepositoryToken(K));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listIndices', () => {
    it('should return list of indices', async () => {
      const mockSecurities = [mockSecurity];
      jest.spyOn(securityRepository, 'find').mockResolvedValue(mockSecurities);

      const result = (await service.listIndices()) as unknown as {
        success: boolean;
        data: any[];
      };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('symbol', '000001');
      expect(result.data[0]).toHaveProperty('name', '上证指数');
    });
  });

  describe('getKlineData', () => {
    it('should return k-line data for valid symbol and period', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockSecurity);

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockK]),
      };

      jest
        .spyOn(kRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getKlineData(
        '000001',
        '1min' as any,
        10,
      )) as unknown as { success: boolean; data: any[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('time');
      expect(result.data[0]).toHaveProperty('open', 3000);
      expect(result.data[0]).toHaveProperty('close', 3010);
    });

    it('should return error for invalid symbol', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(null);

      const result = (await service.getKlineData(
        '999999',
        '1min' as any,
        10,
      )) as unknown as { success: boolean; error: { message: string } };

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });

    it('should return error for invalid limit', async () => {
      const result = (await service.getKlineData(
        '000001',
        '1min' as any,
        0,
      )) as unknown as { success: boolean; error: { message: string } };

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('limit must be at least 1');
    });
  });
});
