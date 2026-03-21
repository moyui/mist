import { Test, TestingModule } from '@nestjs/testing';
import { DataCollectorService } from './data-collector.service';
import { StockService } from '../stock/stock.service';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { Period } from '../chan/enums/period.enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketDataBar, Security } from '@app/shared-data';

const mockMarketDataBarRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockSecurityRepository = {
  findOne: jest.fn(),
};

const mockStockService = {
  findByCode: jest.fn(),
  getSourceFormat: jest.fn(),
};

const mockEastMoneySource = {
  fetchKLine: jest.fn(),
  isSupportedPeriod: jest.fn(),
  getPeriodFormat: jest.fn(),
};

const mockTdxSource = {
  fetchKLine: jest.fn(),
  isSupportedPeriod: jest.fn(),
  getPeriodFormat: jest.fn(),
};

describe('DataCollectorService', () => {
  let service: DataCollectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCollectorService,
        {
          provide: getRepositoryToken(MarketDataBar),
          useValue: mockMarketDataBarRepository,
        },
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: StockService,
          useValue: mockStockService,
        },
        {
          provide: EastMoneySource,
          useValue: mockEastMoneySource,
        },
        {
          provide: TdxSource,
          useValue: mockTdxSource,
        },
      ],
    }).compile();

    service = module.get<DataCollectorService>(DataCollectorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectKLine', () => {
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
    };

    const mockKLineData = [
      {
        timestamp: new Date('2024-01-01T09:30:00.000Z'),
        open: 10.5,
        high: 11.0,
        low: 10.3,
        close: 10.8,
        volume: 1000000,
        amount: 10500000,
        period: Period.One,
      },
      {
        timestamp: new Date('2024-01-01T09:31:00.000Z'),
        open: 10.8,
        high: 10.9,
        low: 10.7,
        close: 10.85,
        volume: 800000,
        amount: 8680000,
        period: Period.One,
      },
    ];

    beforeEach(() => {
      mockStockService.findByCode.mockResolvedValue(mockStock);
      mockStockService.getSourceFormat.mockResolvedValue({
        type: 'east_money',
        config: {},
      });
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(true);
      mockEastMoneySource.fetchKLine.mockResolvedValue(mockKLineData);
      mockMarketDataBarRepository.create.mockImplementation((data) => data);
      mockMarketDataBarRepository.save.mockResolvedValue(null);
    });

    it('should successfully collect and save K-line data', async () => {
      await service.collectKLine(
        '000001',
        Period.One,
        new Date('2024-01-01'),
        new Date('2024-01-02'),
      );

      expect(mockStockService.findByCode).toHaveBeenCalledWith('000001');
      expect(mockStockService.getSourceFormat).toHaveBeenCalledWith('000001');
      expect(mockEastMoneySource.fetchKLine).toHaveBeenCalled();
      expect(mockMarketDataBarRepository.create).toHaveBeenCalledTimes(2);
      expect(mockMarketDataBarRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.findByCode.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(
        service.collectKLine(
          '999999',
          Period.One,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when data source is not available', async () => {
      mockStockService.getSourceFormat.mockResolvedValue({
        type: 'invalid_source',
        config: {},
      });

      await expect(
        service.collectKLine(
          '000001',
          Period.One,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when period is not supported', async () => {
      mockEastMoneySource.isSupportedPeriod.mockReturnValue(false);

      await expect(
        service.collectKLine(
          '000001',
          Period.One,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle empty data gracefully', async () => {
      mockEastMoneySource.fetchKLine.mockResolvedValue([]);

      await expect(
        service.collectKLine(
          '000001',
          Period.One,
          new Date('2024-01-01'),
          new Date('2024-01-02'),
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('getCollectionStatus', () => {
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
    };

    beforeEach(() => {
      mockStockService.findByCode.mockResolvedValue(mockStock);
    });

    it('should return status when data exists', async () => {
      mockMarketDataBarRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          count: '5',
          lastRecord: '2024-01-01T10:00:00.000Z',
          firstRecord: '2024-01-01T09:30:00.000Z',
        }),
      });

      const result = await service.getCollectionStatus(
        '000001',
        Period.One,
        new Date('2024-01-01'),
        new Date('2024-01-02'),
      );

      expect(result).toEqual({
        hasData: true,
        recordCount: 5,
        lastRecord: new Date('2024-01-01T10:00:00.000Z'),
        firstRecord: new Date('2024-01-01T09:30:00.000Z'),
      });
    });

    it('should return status when no data exists', async () => {
      mockMarketDataBarRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          count: '0',
          lastRecord: null,
          firstRecord: null,
        }),
      });

      const result = await service.getCollectionStatus(
        '000001',
        Period.One,
        new Date('2024-01-01'),
        new Date('2024-01-02'),
      );

      expect(result).toEqual({
        hasData: false,
        recordCount: 0,
        lastRecord: undefined,
        firstRecord: undefined,
      });
    });
  });

  describe('removeDuplicateData', () => {
    beforeEach(() => {
      mockMarketDataBarRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { timestamp: '2024-01-01T09:30:00.000Z' },
            { timestamp: '2024-01-01T09:31:00.000Z' },
          ]),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      });
    });

    it('should remove duplicate data and return count', async () => {
      const result = await service.removeDuplicateData('000001', Period.One);
      expect(result).toBe(2);
    });

    it('should return 0 when no duplicates found', async () => {
      mockMarketDataBarRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const result = await service.removeDuplicateData('000001', Period.One);
      expect(result).toBe(0);
    });
  });
});
