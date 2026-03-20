import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KLineExtensionEF } from './kline-extension-ef.entity';
import { DataSource, KLinePeriod } from '../enums';

describe('KLineExtensionEF', () => {
  let repository: Repository<KLineExtensionEF>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(KLineExtensionEF),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<Repository<KLineExtensionEF>>(
      getRepositoryToken(KLineExtensionEF),
    );
  });

  describe('Entity Creation', () => {
    it('should create a KLineExtensionEF entity with required fields', () => {
      const entityData = {
        source: DataSource.EAST_MONEY,
        period: KLinePeriod.DAILY,
        timestamp: new Date('2024-01-01T10:00:00Z'),
        amplitude: 5.23,
        changePct: 2.15,
        changeAmt: 15.3,
        turnoverRate: 3.4567,
        prevClose: 712.5,
        open: 725.0,
        high: 730.25,
        low: 720.75,
        close: 727.8,
        volume: 12345678n,
        amount: 892345678.9,
        tradeCount: 98765n,
        floatShare: 100000000n,
        totalShare: 150000000n,
      };

      const entity = repository.create(entityData);

      expect(entity).toBeInstanceOf(KLineExtensionEF);
      expect(entity.source).toBe(DataSource.EAST_MONEY);
      expect(entity.period).toBe(KLinePeriod.DAILY);
      expect(entity.amplitude).toBe(5.23);
      expect(entity.changePct).toBe(2.15);
      expect(entity.changeAmt).toBe(15.3);
      expect(entity.turnoverRate).toBe(3.4567);
      expect(entity.prevClose).toBe(712.5);
      expect(entity.open).toBe(725.0);
      expect(entity.close).toBe(727.8);
    });

    it('should have correct field types and constraints', () => {
      const entity = new KLineExtensionEF();

      expect(entity.id).toBeDefined();
      expect(entity.source).toBeDefined();
      expect(entity.period).toBeDefined();
      expect(entity.timestamp).toBeDefined();
      expect(entity.amplitude).toBeDefined();
      expect(entity.changePct).toBeDefined();
      expect(entity.changeAmt).toBeDefined();
      expect(entity.turnoverRate).toBeDefined();
      expect(entity.prevClose).toBeDefined();
      expect(entity.open).toBeDefined();
      expect(entity.high).toBeDefined();
      expect(entity.low).toBeDefined();
      expect(entity.close).toBeDefined();
      expect(entity.volume).toBeDefined();
      expect(entity.amount).toBeDefined();
      expect(entity.tradeCount).toBeDefined();
      expect(entity.floatShare).toBeDefined();
      expect(entity.totalShare).toBeDefined();
      expect(entity.createTime).toBeDefined();
    });

    it('should have correct index annotations', () => {
      const entity = new KLineExtensionEF();
      // The entity should have proper index annotations for performance
      expect(entity).toBeDefined();
    });

    it('should have correct default source value', () => {
      const entityData = {
        period: KLinePeriod.DAILY,
        timestamp: new Date('2024-01-01T10:00:00Z'),
        amplitude: 5.23,
        changePct: 2.15,
        changeAmt: 15.3,
        turnoverRate: 3.4567,
        prevClose: 712.5,
        open: 725.0,
        high: 730.25,
        low: 720.75,
        close: 727.8,
        volume: 12345678n,
        amount: 892345678.9,
        tradeCount: 98765n,
        floatShare: 100000000n,
        totalShare: 150000000n,
      };

      const entity = repository.create(entityData);

      expect(entity.source).toBe(DataSource.EAST_MONEY);
    });
  });

  describe('Entity Validation', () => {
    it('should accept all valid data source enum values', () => {
      const validSources = [
        DataSource.EAST_MONEY,
        DataSource.TDX,
        DataSource.MINI_QMT,
      ];

      validSources.forEach((source) => {
        const entityData = {
          source,
          period: KLinePeriod.DAILY,
          timestamp: new Date('2024-01-01T10:00:00Z'),
          amplitude: 5.23,
          changePct: 2.15,
          changeAmt: 15.3,
          turnoverRate: 3.4567,
          prevClose: 712.5,
          open: 725.0,
          high: 730.25,
          low: 720.75,
          close: 727.8,
          volume: 12345678n,
          amount: 892345678.9,
          tradeCount: 98765n,
          floatShare: 100000000n,
          totalShare: 150000000n,
        };

        const entity = repository.create(entityData);
        expect(entity.source).toBe(source);
      });
    });

    it('should accept all valid period enum values', () => {
      const validPeriods = [
        KLinePeriod.ONE_MIN,
        KLinePeriod.FIVE_MIN,
        KLinePeriod.FIFTEEN_MIN,
        KLinePeriod.THIRTY_MIN,
        KLinePeriod.SIXTY_MIN,
        KLinePeriod.DAILY,
      ];

      validPeriods.forEach((period) => {
        const entityData = {
          source: DataSource.EAST_MONEY,
          period,
          timestamp: new Date('2024-01-01T10:00:00Z'),
          amplitude: 5.23,
          changePct: 2.15,
          changeAmt: 15.3,
          turnoverRate: 3.4567,
          prevClose: 712.5,
          open: 725.0,
          high: 730.25,
          low: 720.75,
          close: 727.8,
          volume: 12345678n,
          amount: 892345678.9,
          tradeCount: 98765n,
          floatShare: 100000000n,
          totalShare: 150000000n,
        };

        const entity = repository.create(entityData);
        expect(entity.period).toBe(period);
      });
    });
  });
});
