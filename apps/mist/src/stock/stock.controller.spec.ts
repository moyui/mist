import { Test, TestingModule } from '@nestjs/testing';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockStockService = {
  initStock: jest.fn(),
  addSource: jest.fn(),
  findByCode: jest.fn(),
  findAll: jest.fn(),
  deactivateStock: jest.fn(),
  activateStock: jest.fn(),
  getSourceFormat: jest.fn(),
};

describe('StockController', () => {
  let controller: StockController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockController],
      providers: [
        {
          provide: StockService,
          useValue: mockStockService,
        },
      ],
    }).compile();

    controller = module.get<StockController>(StockController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initStock', () => {
    const initStockDto: InitStockDto = {
      code: '000001.SH',
      name: '平安银行',
      type: 'stock',
      source: {
        type: 'aktools',
        config: '',
      },
    };

    const mockStock = {
      id: 1,
      code: '000001.SH',
      name: '平安银行',
      type: 'stock',
      periods: [1, 5, 15, 30, 60, 1440],
      source: {
        type: 'aktools',
        config: '',
      },
      isActive: true,
    };

    it('should successfully initialize a new stock', async () => {
      mockStockService.initStock.mockResolvedValue(mockStock);

      const result = await controller.initStock(initStockDto);

      expect(result).toEqual(mockStock);
      expect(mockStockService.initStock).toHaveBeenCalledWith(initStockDto);
    });

    it('should throw ConflictException when stock already exists', async () => {
      mockStockService.initStock.mockRejectedValue(
        new ConflictException('Stock already exists'),
      );

      await expect(controller.initStock(initStockDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addSource', () => {
    const addSourceDto: AddSourceDto = {
      code: '000001.SH',
      source: {
        type: 'aktools',
        config: '',
      },
    };

    const mockStock = {
      id: 1,
      code: '000001.SH',
      name: '平安银行',
      type: 'stock',
      periods: [1, 5, 15, 30, 60, 1440],
      source: {
        type: 'aktools',
        config: '',
      },
      isActive: true,
    };

    it('should successfully add source to existing stock', async () => {
      mockStockService.addSource.mockResolvedValue(mockStock);

      const result = await controller.addSource(addSourceDto);

      expect(result).toEqual(mockStock);
      expect(mockStockService.addSource).toHaveBeenCalledWith(addSourceDto);
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.addSource.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.addSource(addSourceDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStock', () => {
    const mockStock = {
      id: 1,
      code: '000001.SH',
      name: '平安银行',
      type: 'stock',
      periods: [1, 5, 15, 30, 60, 1440],
      source: {
        type: 'aktools',
        config: '',
      },
      isActive: true,
    };

    it('should successfully get stock by code', async () => {
      mockStockService.findByCode.mockResolvedValue(mockStock);

      const result = await controller.getStock('000001.SH');

      expect(result).toEqual(mockStock);
      expect(mockStockService.findByCode).toHaveBeenCalledWith('000001.SH');
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.findByCode.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.getStock('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllStocks', () => {
    const mockStocks = [
      {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: 'stock',
        periods: [1, 5, 15, 30, 60, 1440],
        source: {
          type: 'aktools',
          config: '',
        },
        isActive: true,
      },
      {
        id: 2,
        code: '399006.SZ',
        name: '创业板指',
        type: 'index',
        periods: [1, 5, 15, 30, 60, 1440],
        source: {
          type: 'aktools',
          config: '',
        },
        isActive: true,
      },
    ];

    it('should return all active stocks', async () => {
      mockStockService.findAll.mockResolvedValue(mockStocks);

      const result = await controller.getAllStocks();

      expect(result).toEqual(mockStocks);
      expect(mockStockService.findAll).toHaveBeenCalled();
    });
  });

  describe('deactivateStock', () => {
    it('should successfully deactivate a stock', async () => {
      mockStockService.deactivateStock.mockResolvedValue(undefined);

      await expect(
        controller.deactivateStock('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockStockService.deactivateStock).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.deactivateStock.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.deactivateStock('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateStock', () => {
    it('should successfully activate a deactivated stock', async () => {
      mockStockService.activateStock.mockResolvedValue(undefined);

      await expect(
        controller.activateStock('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockStockService.activateStock).toHaveBeenCalledWith('000001.SH');
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.activateStock.mockRejectedValue(
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
      mockStockService.getSourceFormat.mockResolvedValue(mockSource);

      const result = await controller.getSource('000001.SH');

      expect(result).toEqual(mockSource);
      expect(mockStockService.getSourceFormat).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when stock not found', async () => {
      mockStockService.getSourceFormat.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(controller.getSource('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
