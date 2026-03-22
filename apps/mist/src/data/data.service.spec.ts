import { Test, TestingModule } from '@nestjs/testing';
import { DataService } from './data.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, K, KPeriod, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

describe('DataService', () => {
  let service: DataService;
  let dataSourceService: DataSourceService;

  const mockSecurity = {
    id: 1,
    code: '000001',
    name: '上证指数',
    type: 'INDEX',
    exchange: 'SH',
  };

  const mockKBars = [
    {
      id: 1,
      code: '000001',
      timestamp: new Date('2024-01-01'),
      period: KPeriod.DAILY,
      open: 100,
      close: 105,
      highest: 110,
      lowest: 95,
      amount: 1000000,
      security: mockSecurity,
    },
  ];

  const mockSecurityRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockKRepository = {
    find: jest.fn(),
  };

  const mockDataSourceService = {
    select: jest.fn().mockReturnValue(DataSource.EAST_MONEY),
    getDefault: jest.fn().mockReturnValue(DataSource.EAST_MONEY),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataService,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(K),
          useValue: mockKRepository,
        },
        {
          provide: DataSourceService,
          useValue: mockDataSourceService,
        },
      ],
    }).compile();

    service = module.get<DataService>(DataService);
    dataSourceService = module.get<DataSourceService>(DataSourceService);

    // Clear mock calls before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findBars', () => {
    it('should find bars with default source when source is not provided', async () => {
      mockSecurityRepository.findOneBy.mockResolvedValue(mockSecurity);
      mockKRepository.find.mockResolvedValue(mockKBars);

      const result = await service.findBars({
        symbol: '000001',
        period: KPeriod.DAILY,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toEqual(mockKBars);
      expect(dataSourceService.getDefault).toHaveBeenCalled();
      expect(dataSourceService.select).not.toHaveBeenCalled();
    });

    it('should find bars with specified source', async () => {
      mockSecurityRepository.findOneBy.mockResolvedValue(mockSecurity);
      mockKRepository.find.mockResolvedValue(mockKBars);

      const result = await service.findBars({
        symbol: '000001',
        period: KPeriod.DAILY,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        source: DataSource.TDX,
      });

      expect(result).toEqual(mockKBars);
      expect(dataSourceService.select).toHaveBeenCalledWith(DataSource.TDX);
    });

    it('should throw error when security is not found', async () => {
      mockSecurityRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.findBars({
          symbol: '999999',
          period: KPeriod.DAILY,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        }),
      ).rejects.toThrow('Index information not found');
    });
  });

  describe('findBarsById (deprecated)', () => {
    it('should call findBars with converted dates', async () => {
      mockSecurityRepository.findOneBy.mockResolvedValue(mockSecurity);
      mockKRepository.find.mockResolvedValue(mockKBars);

      const findBarsSpy = jest.spyOn(service, 'findBars');

      await service.findBarsById({
        symbol: '000001',
        period: KPeriod.DAILY,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(findBarsSpy).toHaveBeenCalledWith({
        symbol: '000001',
        period: KPeriod.DAILY,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });
    });
  });
});
