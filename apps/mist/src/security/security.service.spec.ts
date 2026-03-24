import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SecurityService } from './security.service';
import {
  Security,
  SecuritySourceConfig,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { InitStockDto, SourceType, StockType } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { CollectorService } from '../collector/collector.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('SecurityService', () => {
  let service: SecurityService;

  const mockSecurityRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((entity) => entity),
  };

  const mockCollectorService = {
    collectKLine: jest.fn(),
  };

  const mockSourceConfigRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(SecuritySourceConfig),
          useValue: mockSourceConfigRepository,
        },
        {
          provide: CollectorService,
          useValue: mockCollectorService,
        },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
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
        config: '{}',
      },
    };

    it('should successfully create a new stock and collect historical data', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);
      mockSecurityRepository.save.mockResolvedValue({
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      } as Security);
      mockCollectorService.collectKLine.mockResolvedValue(undefined);

      const result = await service.initStock(initStockDto);

      expect(result.code).toBe('000001.SH');
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001.SH' },
      });
      expect(mockCollectorService.collectKLine).toHaveBeenCalled();
    });

    it('should throw conflict exception if stock already exists', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      } as Security);

      await expect(service.initStock(initStockDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addSource', () => {
    const addSourceDto: AddSourceDto = {
      code: '000001.SH',
      source: {
        type: SourceType.AKTOOLS,
        config: '{"base": "updated"}',
      },
    };

    const existingSecurity = {
      id: 1,
      code: '000001.SH',
      name: '平安银行',
      type: SecurityType.STOCK,
      exchange: 'SH',
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    } as Security;

    it('should successfully add source to existing stock (placeholder implementation)', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(existingSecurity);

      const result = await service.addSource(addSourceDto);

      expect(result.code).toBe('000001.SH');
      // Note: Current implementation just returns stock without modifying source config
      // This can be extended in the future to create SecuritySourceConfig entries
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

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
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(stock);

      const result = await service.findByCode('000001.SH');

      expect(result).toEqual(stock);
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return stock even if suspended (status check removed in new implementation)', async () => {
      const suspendedStock = {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.SUSPENDED,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(suspendedStock);

      const result = await service.findByCode('000001.SH');

      expect(result).toEqual(suspendedStock);
    });
  });

  describe('getSourceFormat', () => {
    it('should return source format for existing stock', async () => {
      const stock = {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      } as Security;

      const sourceConfigs = [
        {
          id: 1,
          security: stock,
          source: 'aktools',
          formatCode: '{"base": "shanghai"}',
          createTime: new Date(),
          updateTime: new Date(),
        },
      ];

      mockSecurityRepository.findOne.mockResolvedValue(stock);
      mockSourceConfigRepository.find.mockResolvedValue(sourceConfigs);

      const result = await service.getSourceFormat('000001.SH');

      expect(result).toEqual({
        type: 'aktools',
        config: '{"base": "shanghai"}',
      });
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(service.getSourceFormat('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return none type if no source configs exist', async () => {
      const stock = {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      } as Security;

      mockSecurityRepository.findOne.mockResolvedValue(stock);
      mockSourceConfigRepository.find.mockResolvedValue([]);

      const result = await service.getSourceFormat('000001.SH');

      expect(result).toEqual({
        type: 'none',
        config: undefined,
      });
    });
  });

  describe('findAll', () => {
    it('should return all active stocks', async () => {
      const stocks = [
        {
          id: 1,
          code: '000001.SH',
          name: '平安银行',
          type: SecurityType.STOCK,
          exchange: 'SH',
          status: SecurityStatus.ACTIVE,
          createTime: new Date(),
          updateTime: new Date(),
        },
        {
          id: 2,
          code: '399006.SZ',
          name: '创业板指',
          type: SecurityType.INDEX,
          exchange: 'SZ',
          status: SecurityStatus.ACTIVE,
          createTime: new Date(),
          updateTime: new Date(),
        },
      ];

      mockSecurityRepository.find.mockResolvedValue(stocks);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('000001.SH');
      expect(result[1].code).toBe('399006.SZ');
    });
  });

  describe('deactivateStock', () => {
    it('should deactivate existing stock', async () => {
      mockSecurityRepository.update.mockResolvedValue({ affected: 1 });

      await service.deactivateStock('000001.SH');

      expect(mockSecurityRepository.update).toHaveBeenCalledWith(
        { code: '000001.SH' },
        { status: SecurityStatus.SUSPENDED },
      );
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.deactivateStock('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateStock', () => {
    it('should activate existing stock', async () => {
      mockSecurityRepository.update.mockResolvedValue({ affected: 1 });

      await service.activateStock('000001.SH');

      expect(mockSecurityRepository.update).toHaveBeenCalledWith(
        { code: '000001.SH' },
        { status: SecurityStatus.ACTIVE },
      );
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.activateStock('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
