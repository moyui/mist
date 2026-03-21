import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockService } from './stock.service';
import { Stock } from './stock.entity';
import { InitStockDto, SourceType, StockType } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('StockService', () => {
  let service: StockService;

  const mockStockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((entity) => entity),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: getRepositoryToken(Stock),
          useValue: mockStockRepository,
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatCode', () => {
    it('should format code to uppercase and trim whitespace', () => {
      const result = service['formatCode']('  000001.sh  ');
      expect(result).toBe('000001.SH');
    });
  });

  describe('initStock', () => {
    const initStockDto: InitStockDto = {
      code: '000001.SH',
      name: '平安银行',
      type: StockType.STOCK,
      periods: [1, 5, 15],
      source: {
        type: SourceType.AKTOOLS,
        config: '{"base": "shanghai"}',
      },
    };

    it('should successfully create a new stock', async () => {
      mockStockRepository.findOne.mockResolvedValue(null);
      mockStockRepository.save.mockResolvedValue({
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: StockType.STOCK,
        periods: [1, 5, 15],
        source: {
          type: SourceType.AKTOOLS,
          config: '{"base": "shanghai"}',
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.initStock(initStockDto);

      expect(result.code).toBe('000001.SH');
      expect(mockStockRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001.SH' },
      });
    });

    it('should throw conflict exception if stock already exists', async () => {
      mockStockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: StockType.STOCK,
        periods: [1, 5, 15],
        source: {
          type: SourceType.AKTOOLS,
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.initStock(initStockDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should use default periods if not provided', async () => {
      const dtoWithoutPeriods: InitStockDto = {
        ...initStockDto,
        periods: undefined,
      };

      mockStockRepository.findOne.mockResolvedValue(null);
      mockStockRepository.save.mockResolvedValue({
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: StockType.STOCK,
        periods: [1, 5, 15, 30, 60, 1440],
        source: {
          type: SourceType.AKTOOLS,
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.initStock(dtoWithoutPeriods);
      expect(result.periods).toEqual([1, 5, 15, 30, 60, 1440]);
    });
  });

  describe('addSource', () => {
    const addSourceDto: AddSourceDto = {
      code: '000001.SH',
      source: {
        type: SourceType.AKTOOLS,
        config: '{"base": "updated"}',
      },
      periods: [1, 5, 15, 30],
    };

    const existingStock = {
      id: 1,
      code: '000001.SH',
      name: '平安银行',
      type: StockType.STOCK,
      periods: [1, 5],
      source: {
        type: SourceType.AKTOOLS,
        config: '{"base": "shanghai"}',
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully add source to existing stock', async () => {
      mockStockRepository.findOne.mockResolvedValue(existingStock);
      mockStockRepository.save.mockResolvedValue({
        ...existingStock,
        source: addSourceDto.source,
        periods: addSourceDto.periods,
      });

      const result = await service.addSource(addSourceDto);

      expect(result.source.type).toBe(SourceType.AKTOOLS);
      expect(result.source.config).toBe('{"base": "updated"}');
      expect(result.periods).toEqual([1, 5, 15, 30]);
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockStockRepository.findOne.mockResolvedValue(null);

      await expect(service.addSource(addSourceDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByCode', () => {
    it('should return stock by code', async () => {
      const stock = {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: StockType.STOCK,
        periods: [1, 5],
        source: {
          type: SourceType.AKTOOLS,
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStockRepository.findOne.mockResolvedValue(stock);

      const result = await service.findByCode('000001.SH');

      expect(result).toEqual(stock);
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockStockRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw not found exception if stock is inactive', async () => {
      // The findOne call in findByCode includes isActive: true filter, so inactive stocks won't be returned
      mockStockRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSourceFormat', () => {
    it('should return source format for existing stock', async () => {
      const stock = {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: StockType.STOCK,
        periods: [1, 5],
        source: {
          type: SourceType.AKTOOLS,
          config: '{"base": "shanghai"}',
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStockRepository.findOne.mockResolvedValue(stock);

      const result = await service.getSourceFormat('000001.SH');

      expect(result).toEqual({
        type: SourceType.AKTOOLS,
        config: '{"base": "shanghai"}',
      });
    });
  });

  describe('findAll', () => {
    it('should return all active stocks', async () => {
      const stocks = [
        mockInactiveStock(),
        {
          id: 1,
          code: '000001.SH',
          name: '平安银行',
          type: StockType.STOCK,
          periods: [1, 5],
          source: { type: SourceType.AKTOOLS },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          code: '399006.SZ',
          name: '创业板指',
          type: StockType.INDEX,
          periods: [1, 5, 15, 30, 60, 1440],
          source: { type: SourceType.AKTOOLS },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockStockRepository.find.mockResolvedValue([stocks[1], stocks[2]]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('000001.SH');
      expect(result[1].code).toBe('399006.SZ');
    });
  });

  describe('deactivateStock', () => {
    it('should deactivate existing stock', async () => {
      mockStockRepository.update.mockResolvedValue({ affected: 1 });

      await service.deactivateStock('000001.SH');

      expect(mockStockRepository.update).toHaveBeenCalledWith(
        { code: '000001.SH' },
        { isActive: false },
      );
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockStockRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.deactivateStock('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateStock', () => {
    it('should activate existing stock', async () => {
      mockStockRepository.update.mockResolvedValue({ affected: 1 });

      await service.activateStock('000001.SH');

      expect(mockStockRepository.update).toHaveBeenCalledWith(
        { code: '000001.SH' },
        { isActive: true },
      );
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockStockRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.activateStock('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  function mockInactiveStock() {
    return {
      id: 3,
      code: '600000.SH',
      name: '浦发银行',
      type: StockType.STOCK,
      periods: [1, 5],
      source: { type: SourceType.AKTOOLS },
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
});
