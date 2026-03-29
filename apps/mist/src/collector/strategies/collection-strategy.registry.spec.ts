import { DataSource } from '@app/shared-data';
import { BadRequestException } from '@nestjs/common';
import { CollectionStrategyRegistry } from './collection-strategy.registry';
import { IDataCollectionStrategy } from './data-collection.strategy.interface';

describe('CollectionStrategyRegistry', () => {
  let registry: CollectionStrategyRegistry;
  let mockDataSourceService: { getDefault: jest.Mock };
  let mockEastMoneyStrategy: IDataCollectionStrategy;

  beforeEach(() => {
    mockDataSourceService = {
      getDefault: jest.fn().mockReturnValue(DataSource.EAST_MONEY),
    };

    mockEastMoneyStrategy = {
      source: DataSource.EAST_MONEY,
      mode: 'polling' as const,
      collectForSecurity: jest.fn(),
    };

    registry = new CollectionStrategyRegistry(mockDataSourceService as any, [
      mockEastMoneyStrategy,
    ]);
  });

  describe('resolve', () => {
    it('should return strategy matching the provided source', () => {
      const result = registry.resolve(DataSource.EAST_MONEY);
      expect(result).toBe(mockEastMoneyStrategy);
    });

    it('should fall back to env default when no source provided', () => {
      const result = registry.resolve(undefined);
      expect(mockDataSourceService.getDefault).toHaveBeenCalled();
      expect(result).toBe(mockEastMoneyStrategy);
    });

    it('should throw BadRequestException for unregistered source', () => {
      expect(() => registry.resolve(DataSource.TDX)).toThrow(
        BadRequestException,
      );
      expect(() => registry.resolve(DataSource.TDX)).toThrow(
        'No collection strategy found for data source: tdx',
      );
    });
  });
});
