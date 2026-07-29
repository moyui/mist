import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from './collector.service';
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import { TdxSource } from '../sources/tdx/tdx-source.service';
import { QmtSource } from '../sources/qmt/qmt-source.service';
import {
  Period,
  DataSource,
  SecuritySourceConfig,
  SecurityType,
  Security,
} from '@app/shared-data';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
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

const mockQmtSource = {
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
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

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
          provide: QmtSource,
          useValue: mockQmtSource,
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
    jest.restoreAllMocks();
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
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Successfully collected 2 K-line records for 000001, period 1',
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
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No data returned for security 000001'),
      );
    });

    it('should log and rethrow collection failures', async () => {
      const error = new Error('source down');
      mockEastMoneySource.fetchK.mockRejectedValue(error);

      await expect(
        service.collectK(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(error);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to collect K-line data for 000001:',
        error,
      );
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
      mockQmtSource.isSupportedPeriod.mockReturnValue(true);
      mockQmtSource.fetchK.mockResolvedValue(mockKData);
      mockQmtSource.saveK.mockResolvedValue(undefined);
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
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Successfully collected 1 K-line records for 000001, period 1 from ef',
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

    it('fails before a provider request when the enabled source config has no formatCode', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        ...mockStock,
        sourceConfigs: [
          {
            source: DataSource.QMT,
            formatCode: '',
            enabled: true,
          },
        ],
      });

      await expect(
        service.collectKForSource(
          '000001',
          Period.ONE_MIN,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
          DataSource.QMT,
        ),
      ).rejects.toThrow('provider symbol resolution failed');

      expect(mockQmtSource.fetchK).not.toHaveBeenCalled();
      expect(mockQmtSource.saveK).not.toHaveBeenCalled();
    });

    it('collects and saves historical K data from QMT when requested explicitly', async () => {
      const qmtStock = {
        ...mockStock,
        sourceConfigs: [
          {
            source: DataSource.QMT,
            formatCode: '600519.SH',
            enabled: true,
          },
        ],
      };
      mockSecurityRepository.findOne.mockResolvedValue(qmtStock);
      mockQmtSource.fetchK.mockResolvedValue([
        {
          timestamp: new Date('2026-07-03T14:30:00+08:00'),
          open: 11.1,
          high: 11.5,
          low: 10.9,
          close: 11.3,
          volume: 1200,
          amount: 13560,
          period: Period.THREE_MIN,
          extensions: {
            nativePeriod: '3m',
          },
        },
      ]);

      const count = await service.collectKForSource(
        '600519',
        Period.THREE_MIN,
        new Date('2026-07-03T09:30:00+08:00'),
        new Date('2026-07-03T15:00:00+08:00'),
        DataSource.QMT,
      );

      expect(count).toBe(1);
      expect(mockQmtSource.fetchK).toHaveBeenCalledWith({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.THREE_MIN,
        startDate: new Date('2026-07-03T09:30:00+08:00'),
        endDate: new Date('2026-07-03T15:00:00+08:00'),
      });
      expect(mockQmtSource.saveK).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            period: Period.THREE_MIN,
            extensions: expect.objectContaining({
              nativePeriod: '3m',
            }),
          }),
        ]),
        qmtStock,
        Period.THREE_MIN,
      );
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRawData = [
        {
          timestamp: new Date('2024-01-01T09:30:00.000Z'),
          open: 10.5,
          high: 11.0,
          low: 10.3,
          close: 10.8,
          volume: '1000000',
          amount: '10500000',
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
            formatCode: '600001.SH',
            enabled: true,
          },
        ],
        ks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockSourceConfigRepository.find.mockResolvedValue([
        {
          security,
          source: DataSource.TDX,
          priority: 10,
          enabled: true,
          formatCode: '600001.SH',
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
        createdAt: new Date(),
        updatedAt: new Date(),
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
