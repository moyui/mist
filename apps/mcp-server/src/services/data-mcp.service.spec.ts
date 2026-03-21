import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMcpService } from './data-mcp.service';
import { Security, MarketDataBar, KPeriod } from '@app/shared-data';

describe('DataMcpService', () => {
  let service: DataMcpService;
  let securityRepository: Repository<Security>;
  let marketDataBarRepository: Repository<MarketDataBar>;

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
    marketDataBars: [],
  } as any;

  const mockMarketDataBar = {
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
          provide: getRepositoryToken(MarketDataBar),
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
    marketDataBarRepository = module.get<Repository<MarketDataBar>>(
      getRepositoryToken(MarketDataBar),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listIndices', () => {
    it('should return list of indices', async () => {
      const mockSecurities = [mockSecurity];
      jest.spyOn(securityRepository, 'find').mockResolvedValue(mockSecurities);

      const result = await service.listIndices();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('code', '000001');
      expect(result[0]).toHaveProperty('name', '上证指数');
    });
  });

  describe('getKlineData', () => {
    it('should return k-line data for valid symbol and period', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockSecurity);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([mockMarketDataBar]),
      };

      jest
        .spyOn(marketDataBarRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getKlineData('000001', '1min', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('time');
      expect(result[0]).toHaveProperty('open', 3000);
      expect(result[0]).toHaveProperty('close', 3010);
    });

    it('should throw error for invalid symbol', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getKlineData('999999', '1min', 10),
      ).rejects.toThrow();
    });

    it('should throw error for invalid limit', async () => {
      await expect(service.getKlineData('000001', '1min', 0)).rejects.toThrow();
    });
  });
});
