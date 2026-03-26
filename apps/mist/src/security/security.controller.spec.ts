import { Test, TestingModule } from '@nestjs/testing';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { InitStockDto, SourceType } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Security, SecurityType } from '@app/shared-data';

const mockSecurityService = {
  initStock: jest.fn(),
  addSource: jest.fn(),
  findByCode: jest.fn(),
  findAll: jest.fn(),
  deactivateStock: jest.fn(),
  activateStock: jest.fn(),
  getSourceFormat: jest.fn(),
};

describe('SecurityController', () => {
  let controller: SecurityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
      ],
    }).compile();

    controller = module.get<SecurityController>(SecurityController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initStock', () => {
    const initStockDto: InitStockDto = {
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
    };

    const mockStock: Security = {
      id: 1,
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
      // exchange: 'SH',
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully initialize a new stock', async () => {
      mockSecurityService.initStock.mockResolvedValue(mockStock);

      const result = await controller.initStock(initStockDto);

      expect(result).toEqual(mockStock);
      expect(mockSecurityService.initStock).toHaveBeenCalledWith(initStockDto);
    });

    it('should throw ConflictException when stock already exists', async () => {
      mockSecurityService.initStock.mockRejectedValue(
        new ConflictException('Stock already exists'),
      );

      await expect(controller.initStock(initStockDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addSource', () => {
    const addSourceDto: AddSourceDto = {
      code: '600001',
      source: {
        type: SourceType.AKTOOLS,
        config: '{}',
      },
    };

    const mockStock: Security = {
      id: 1,
      code: '600001',
      name: '测试股票',
      type: SecurityType.STOCK,
      // exchange: 'SH',
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully add source to existing stock', async () => {
      mockSecurityService.addSource.mockResolvedValue(mockStock);

      const result = await controller.addSource(addSourceDto);

      expect(result).toEqual(mockStock);
      expect(mockSecurityService.addSource).toHaveBeenCalledWith(addSourceDto);
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityService.addSource.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.addSource(addSourceDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should add source configuration to existing stock', async () => {
      // First create stock
      const initStockDto: InitStockDto = {
        code: '600001',
        name: '测试股票',
        type: SecurityType.STOCK,
      };

      mockSecurityService.initStock.mockResolvedValue(mockStock);
      await controller.initStock(initStockDto);

      // Then add source
      mockSecurityService.addSource.mockResolvedValue(mockStock);
      const result = await controller.addSource(addSourceDto);

      expect(result).toHaveProperty('code', '600001');
      expect(mockSecurityService.initStock).toHaveBeenCalledWith(initStockDto);
      expect(mockSecurityService.addSource).toHaveBeenCalledWith(addSourceDto);
    });
  });

  describe('getStock', () => {
    const mockStock: Security = {
      id: 1,
      code: '000001',
      name: '平安银行',
      type: SecurityType.STOCK,
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully get stock by code', async () => {
      mockSecurityService.findByCode.mockResolvedValue(mockStock);

      const result = await controller.getStock('000001.SH');

      expect(result).toEqual(mockStock);
      expect(mockSecurityService.findByCode).toHaveBeenCalledWith('000001.SH');
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityService.findByCode.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.getStock('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllStocks', () => {
    const mockStocks: Security[] = [
      {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        status: 'ACTIVE' as any,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      },
      {
        id: 2,
        code: '399006.SZ',
        name: '创业板指',
        type: SecurityType.INDEX,
        status: 'ACTIVE' as any,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      },
    ];

    it('should return all active stocks', async () => {
      mockSecurityService.findAll.mockResolvedValue(mockStocks);

      const result = await controller.getAllStocks();

      expect(result).toEqual(mockStocks);
      expect(mockSecurityService.findAll).toHaveBeenCalled();
    });
  });

  describe('deactivateStock', () => {
    it('should successfully deactivate a stock', async () => {
      mockSecurityService.deactivateStock.mockResolvedValue(undefined);

      await expect(
        controller.deactivateStock('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockSecurityService.deactivateStock).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityService.deactivateStock.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.deactivateStock('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateStock', () => {
    it('should successfully activate a deactivated stock', async () => {
      mockSecurityService.activateStock.mockResolvedValue(undefined);

      await expect(
        controller.activateStock('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockSecurityService.activateStock).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityService.activateStock.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.activateStock('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSource', () => {
    it('should successfully get source configuration', async () => {
      const mockSource = { type: 'aktools', config: {} };
      mockSecurityService.getSourceFormat.mockResolvedValue(mockSource);

      const result = await controller.getSource('000001.SH');

      expect(result).toEqual(mockSource);
      expect(mockSecurityService.getSourceFormat).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockSecurityService.getSourceFormat.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.getSource('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
