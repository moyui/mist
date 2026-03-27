import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SecurityService } from './security.service';
import {
  Security,
  SecuritySourceConfig,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import { DataSource } from '@app/shared-data';
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

  const mockSourceConfigRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((entity) => entity),
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
    it('should create a stock without source config or data collection', async () => {
      const initStockDto: InitStockDto = {
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
      };

      mockSecurityRepository.findOne.mockResolvedValue(null);
      mockSecurityRepository.create.mockReturnValue({
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security);
      mockSecurityRepository.save.mockResolvedValue({
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security);

      const result = await service.initStock(initStockDto);

      expect(result).toBeDefined();
      expect(result.code).toBe('600000');
      expect(result.type).toBe(SecurityType.STOCK);
    });

    it('should throw ConflictException if stock already exists', async () => {
      const initStockDto: InitStockDto = {
        code: '600000',
        type: SecurityType.STOCK,
      };

      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '600000',
      } as Security);

      await expect(service.initStock(initStockDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addSource', () => {
    it('should create source config for existing stock', async () => {
      const addSourceDto: AddSecuritySourceDto = {
        code: '600000',
        source: DataSource.EAST_MONEY,
        formatCode: '{}',
      };

      const mockStock = {
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security;

      mockSecurityRepository.findOne.mockResolvedValue(mockStock);
      mockSourceConfigRepository.create.mockReturnValue({
        security: mockStock,
        source: DataSource.EAST_MONEY,
        formatCode: '{}',
        priority: 0,
        enabled: true,
      } as SecuritySourceConfig);
      mockSourceConfigRepository.save.mockResolvedValue(
        {} as SecuritySourceConfig,
      );

      const result = await service.addSource(addSourceDto);

      expect(result).toEqual(mockStock);
      expect(mockSourceConfigRepository.create).toHaveBeenCalledWith({
        security: mockStock,
        source: DataSource.EAST_MONEY,
        formatCode: '{}',
        priority: 0,
        enabled: true,
      });
      expect(mockSourceConfigRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if stock not found', async () => {
      const addSourceDto: AddSecuritySourceDto = {
        code: '999999',
        source: DataSource.EAST_MONEY,
      };

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
          source: DataSource.EAST_MONEY,
          formatCode: '{"base": "shanghai"}',
          createTime: new Date(),
          updateTime: new Date(),
        },
      ];

      mockSecurityRepository.findOne.mockResolvedValue(stock);
      mockSourceConfigRepository.find.mockResolvedValue(sourceConfigs);

      const result = await service.getSourceFormat('000001.SH');

      expect(result).toEqual({
        type: DataSource.EAST_MONEY,
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
