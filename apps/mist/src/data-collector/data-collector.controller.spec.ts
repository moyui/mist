import { Test, TestingModule } from '@nestjs/testing';
import { DataCollectorController } from './data-collector.controller';
import { DataCollectorService } from './data-collector.service';
import { CollectKLineDto } from './dto/collect-kline.dto';
import { Period } from '../chan/enums/period.enum';
import { NotFoundException } from '@nestjs/common';

const mockDataCollectorService = {
  collectKLine: jest.fn(),
  getCollectionStatus: jest.fn(),
  removeDuplicateData: jest.fn(),
};

describe('DataCollectorController', () => {
  let controller: DataCollectorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataCollectorController],
      providers: [
        {
          provide: DataCollectorService,
          useValue: mockDataCollectorService,
        },
      ],
    }).compile();

    controller = module.get<DataCollectorController>(DataCollectorController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('collectKLine', () => {
    const collectKLineDto: CollectKLineDto = {
      code: '000001.SH',
      period: Period.One,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-01-31T23:59:59.999Z',
    };

    it('should successfully collect K-line data', async () => {
      mockDataCollectorService.collectKLine.mockResolvedValue(undefined);
      mockDataCollectorService.getCollectionStatus.mockResolvedValue({
        hasData: true,
        recordCount: 150,
        lastRecord: new Date('2024-01-31T15:30:00.000Z'),
        firstRecord: new Date('2024-01-01T09:30:00.000Z'),
      });

      const result = await controller.collectKLine(collectKLineDto);

      expect(result.success).toBe(true);
      expect(result.code).toBe(200);
      expect(result.recordCount).toBe(150);
      expect(mockDataCollectorService.collectKLine).toHaveBeenCalledWith(
        '000001.SH',
        Period.One,
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T23:59:59.999Z'),
      );
    });

    it('should handle missing end date', async () => {
      const dto: CollectKLineDto = {
        code: '000001.SH',
        period: Period.One,
        startDate: '2024-01-01T00:00:00.000Z',
      };

      mockDataCollectorService.collectKLine.mockResolvedValue(undefined);
      mockDataCollectorService.getCollectionStatus.mockResolvedValue({
        hasData: true,
        recordCount: 150,
      });

      const result = await controller.collectKLine(dto);

      expect(result.success).toBe(true);
      expect(mockDataCollectorService.collectKLine).toHaveBeenCalledWith(
        '000001.SH',
        Period.One,
        new Date('2024-01-01T00:00:00.000Z'),
        expect.any(Date), // Should use current date
      );
    });

    it('should return error for invalid date range', async () => {
      const dto: CollectKLineDto = {
        code: '000001.SH',
        period: Period.One,
        startDate: '2024-01-31T00:00:00.000Z',
        endDate: '2024-01-01T00:00:00.000Z',
      };

      const result = await controller.collectKLine(dto);

      expect(result.success).toBe(false);
      expect(result.code).toBe(1001);
      expect(result.message).toContain('Start date must be before end date');
    });

    it('should handle service errors', async () => {
      mockDataCollectorService.collectKLine.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      const result = await controller.collectKLine(collectKLineDto);

      expect(result.success).toBe(false);
      expect(result.code).toBe(1002);
      expect(result.message).toBe('Stock not found');
    });
  });

  describe('getCollectionStatus', () => {
    it('should return collection status', async () => {
      mockDataCollectorService.getCollectionStatus.mockResolvedValue({
        hasData: true,
        recordCount: 150,
        lastRecord: new Date('2024-01-31T15:30:00.000Z'),
        firstRecord: new Date('2024-01-01T09:30:00.000Z'),
      });

      const result = await controller.getCollectionStatus(
        '000001.SH',
        Period.One,
        '2024-01-01',
        '2024-01-31',
      );

      expect(result.success).toBe(true);
      expect(result.data.hasData).toBe(true);
      expect(result.data.recordCount).toBe(150);
      expect(mockDataCollectorService.getCollectionStatus).toHaveBeenCalledWith(
        '000001.SH',
        Period.One,
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T00:00:00.000Z'),
      );
    });

    it('should handle missing end date', async () => {
      mockDataCollectorService.getCollectionStatus.mockResolvedValue({
        hasData: true,
        recordCount: 150,
      });

      const result = await controller.getCollectionStatus(
        '000001.SH',
        Period.One,
        '2024-01-01',
      );

      expect(result.success).toBe(true);
      expect(mockDataCollectorService.getCollectionStatus).toHaveBeenCalledWith(
        '000001.SH',
        Period.One,
        new Date('2024-01-01T00:00:00.000Z'),
        expect.any(Date),
      );
    });

    it('should return error for invalid date range', async () => {
      const result = await controller.getCollectionStatus(
        '000001.SH',
        Period.One,
        '2024-01-31',
        '2024-01-01',
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe(1001);
    });
  });

  describe('removeDuplicates', () => {
    it('should successfully remove duplicates', async () => {
      mockDataCollectorService.removeDuplicateData.mockResolvedValue(5);

      const result = await controller.removeDuplicates('000001.SH', Period.One);

      expect(result.success).toBe(true);
      expect(result.data.removedCount).toBe(5);
      expect(mockDataCollectorService.removeDuplicateData).toHaveBeenCalledWith(
        '000001.SH',
        Period.One,
      );
    });

    it('should handle service errors', async () => {
      mockDataCollectorService.removeDuplicateData.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      const result = await controller.removeDuplicates('000001.SH', Period.One);

      expect(result.success).toBe(false);
      expect(result.code).toBe(1002);
    });
  });

  describe('requestId generation', () => {
    it('should generate unique request IDs', async () => {
      mockDataCollectorService.collectKLine.mockResolvedValue(undefined);
      mockDataCollectorService.getCollectionStatus.mockResolvedValue({
        hasData: false,
        recordCount: 0,
      });

      const result1 = await controller.collectKLine({
        code: '000001.SH',
        period: Period.One,
        startDate: '2024-01-01T00:00:00.000Z',
      });

      const result2 = await controller.collectKLine({
        code: '000002.SH',
        period: Period.One,
        startDate: '2024-01-01T00:00:00.000Z',
      });

      expect(result1.requestId).not.toBe(result2.requestId);
      expect(result1.requestId).toMatch(/^collector-\d+-[a-z0-9]+$/);
      expect(result2.requestId).toMatch(/^collector-\d+-[a-z0-9]+$/);
    });
  });
});
