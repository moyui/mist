import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from './collector.service';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import {
  Period,
  DataSource,
  SecuritySourceConfig,
  SecurityType,
  Security,
} from '@app/shared-data';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSourceSelectionService } from '@app/utils';

const mockSecurityRepository = {
  findOne: jest.fn(),
};

const mockEastMoneySource = {
  fetchK: jest.fn(),
  saveK: jest.fn(),
  isSupportedPeriod: jest.fn(),
};

const mockTdxSource = {
  fetchK: jest.fn(),
  saveK: jest.fn(),
  isSupportedPeriod: jest.fn(),
};

const mockSourceConfigRepository = {
  find: jest.fn(),
  save: jest.fn(),
};

const mockDataSourceSelectionService = {
  getDataSourceForSecurity: jest.fn(),
};

describe('CollectorService', () => {
  let service: CollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectorService,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(SecuritySourceConfig),
          useValue: mockSourceConfigRepository,
        },
        {
          provide: EastMoneySource,
          useValue: mockEastMoneySource,
        },
        {
          provide: TdxSource,
          useValue: mockTdxSource,
        },
        {
          provide: DataSourceSelectionService,
          useValue: mockDataSourceSelectionService,
        },
      ],
    }).compile();

    service = module.get<CollectorService>(CollectorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectK', () => {
    const mockStock = {
      id: 1,
      code: '000001',
      name: '平安银行',
      type: 'stock',
      periods: [1, 5, 15, 30, 60, 1440],
      source: {
        type: 'east_money',
        config: {},
      },
      isActive: true,
      sourceConfigs: [
        {
          source: DataSource.EAST_MONEY,
          formatCode: 'sh000001',
          enabled: true,
        },
      ],
    };

    const mockKData = [
      {
        timestamp: new Date('2024-01-01T09:30:00.000Z'),
        open: 10.5,
        high: 11.0,
        low: 10.3,
        close: 10.8,
        volume: 1000000,
        amount: 10500000,
        period: Period.ONE_MIN,
      },
      {
        timestamp: new Date('2024-01-01T09:31:00.000Z'),
        open: 10.8,
        high: 10.9,
        low: 10.7,
        close: 10.85,
        volume: 800000,
        amount: 8680000,
        period: Period.ONE_MIN,
      },
    ];

    beforeEach(() => {
      mockSecurityRepository.findOne.mockResolvedValue(mockStock);
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.EAST_MONEY,
      );
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(true);
      mockEastMoneySource.fetchK.mockResolvedValue(mockKData);
      mockEastMoneySource.saveK.mockResolvedValue(undefined);
    });

    it('should successfully collect and save K-line data', async () => {
      await service.collectK(
        '000001',
        Period.ONE_MIN,
        new Date('2024-01-01'),
        new Date('2024-01-02'),
      );

      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
        relations: ['sourceConfigs'],
      });
      expect(mockEastMoneySource.fetchK).toHaveBeenCalled();
      expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
        mockKData,
        mockStock,
        Period.ONE_MIN,
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.collectK(
          '999999',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when period is not supported', async () => {
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(false);

      await expect(
        service.collectK(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when period is not supported', async () => {
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(false);

      await expect(
        service.collectK(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle empty data gracefully', async () => {
      mockEastMoneySource.fetchK.mockResolvedValue([]);

      await expect(
        service.collectK(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('collectKForSource', () => {
    const mockStock = {
      id: 1,
      code: '000001',
      name: '平安银行',
      type: 'stock',
      periods: [1, 5, 15, 30, 60, 1440],
      source: {
        type: 'east_money',
        config: {},
      },
      isActive: true,
      sourceConfigs: [
        {
          source: DataSource.EAST_MONEY,
          formatCode: 'sh000001',
          enabled: true,
        },
      ],
    };

    const mockKData = [
      {
        timestamp: new Date('2024-01-01T09:30:00.000Z'),
        open: 10.5,
        high: 11.0,
        low: 10.3,
        close: 10.8,
        volume: 1000000,
        amount: 10500000,
        period: Period.ONE_MIN,
      },
    ];

    beforeEach(() => {
      mockSecurityRepository.findOne.mockResolvedValue(mockStock);
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(true);
      mockEastMoneySource.fetchK.mockResolvedValue(mockKData);
      mockEastMoneySource.saveK.mockResolvedValue(undefined);
    });

    it('should collect K-line data for a specific data source with postProcess callback', async () => {
      const postProcessCallback = jest.fn();

      await service.collectKForSource(
        '000001',
        Period.ONE_MIN,
        new Date('2024-01-01'),
        new Date('2024-01-02'),
        DataSource.EAST_MONEY,
        postProcessCallback,
      );

      expect(mockEastMoneySource.fetchK).toHaveBeenCalledWith({
        code: '000001',
        formatCode: 'sh000001',
        period: Period.ONE_MIN,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-02'),
      });
      expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
        mockKData,
        mockStock,
        Period.ONE_MIN,
      );
      expect(postProcessCallback).toHaveBeenCalledWith(
        mockKData,
        DataSource.EAST_MONEY,
      );
    });

    it('should work without postProcess callback', async () => {
      await expect(
        service.collectKForSource(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
          DataSource.EAST_MONEY,
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('findSecurityByCode', () => {
    it('should return security when found', async () => {
      const mockSecurity = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: 'stock',
        periods: [1, 5, 15, 30, 60, 1440],
        source: {
          type: 'east_money',
          config: {},
        },
        isActive: true,
      };

      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);

      const result = await service.findSecurityByCode('000001');
      expect(result).toEqual(mockSecurity);
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
        relations: ['sourceConfigs'],
      });
    });

    it('should return null when security not found', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      const result = await service.findSecurityByCode('999999');
      expect(result).toBeNull();
    });
  });

  describe('saveRawKData', () => {
    it('should delegate to source saveK', async () => {
      const mockSecurity = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      };

      const mockRawData = [
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: 1000000,
          amount: 10500000,
          period: Period.ONE_MIN,
        },
      ];

      mockEastMoneySource.saveK.mockResolvedValue(undefined);

      await service.saveRawKData(
        mockSecurity,
        mockRawData,
        DataSource.EAST_MONEY,
        Period.ONE_MIN,
      );

      expect(mockEastMoneySource.saveK).toHaveBeenCalledWith(
        mockRawData,
        mockSecurity,
        Period.ONE_MIN,
      );
    });
  });

  describe('CollectorService - Data Source Selection', () => {
    it('should use configured data source when SecuritySourceConfig exists', async () => {
      // Create security with TDX config (higher priority)
      const security = {
        id: 1,
        code: 'TEST001',
        name: 'Test Security',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [
          {
            source: DataSource.TDX,
            formatCode: 'test001',
            enabled: true,
          },
        ],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockSourceConfigRepository.find.mockResolvedValue([
        {
          security,
          source: DataSource.TDX,
          priority: 10,
          enabled: true,
          formatCode: 'test001',
        },
      ]);

      // Mock dataSourceSelectionService to return TDX
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.TDX,
      );
      mockTdxSource.isSupportedPeriod.mockReturnValue(true);
      mockTdxSource.fetchK.mockResolvedValue([
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: 1000000,
          amount: 10500000,
          period: Period.FIVE_MIN,
        },
      ]);
      mockTdxSource.saveK.mockResolvedValue(undefined);

      await service.collectK(
        'TEST001',
        Period.FIVE_MIN,
        new Date(),
        new Date(),
      );

      expect(
        mockDataSourceSelectionService.getDataSourceForSecurity,
      ).toHaveBeenCalledWith(security);
    });

    it('should use DataSourceSelectionService instead of hardcoded EAST_MONEY', async () => {
      const security = {
        id: 2,
        code: 'TEST002',
        name: 'Test Security 2',
        type: SecurityType.STOCK,
        status: 1,
        sourceConfigs: [
          {
            source: DataSource.EAST_MONEY,
            formatCode: 'shTEST002',
            enabled: true,
          },
        ],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockSourceConfigRepository.find.mockResolvedValue([]);
      mockDataSourceSelectionService.getDataSourceForSecurity.mockResolvedValue(
        DataSource.EAST_MONEY,
      );
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(true);
      mockEastMoneySource.fetchK.mockResolvedValue([
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: 1000000,
          amount: 10500000,
          period: Period.FIVE_MIN,
        },
      ]);
      mockEastMoneySource.saveK.mockResolvedValue(undefined);

      await service.collectK(
        'TEST002',
        Period.FIVE_MIN,
        new Date(),
        new Date(),
      );

      expect(
        mockDataSourceSelectionService.getDataSourceForSecurity,
      ).toHaveBeenCalled();
    });
  });
});
