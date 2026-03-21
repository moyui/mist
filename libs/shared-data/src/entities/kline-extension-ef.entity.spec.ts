import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KlineExtensionEf } from './kline-extension-ef.entity';

describe('KlineExtensionEf', () => {
  let repository: Repository<KlineExtensionEf>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(KlineExtensionEf),
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

    repository = module.get<Repository<KlineExtensionEf>>(
      getRepositoryToken(KlineExtensionEf),
    );
  });

  describe('Entity Creation', () => {
    it('should create a KlineExtensionEf entity with required fields', () => {
      const entityData = {
        amplitude: 5.23,
        changePct: 2.15,
        changeAmt: 15.3,
        turnoverRate: 3.46,
      };

      const entity = repository.create(entityData);

      expect(entity).toBeInstanceOf(KlineExtensionEf);
      expect(entity.amplitude).toBe(5.23);
      expect(entity.changePct).toBe(2.15);
      expect(entity.changeAmt).toBe(15.3);
      expect(entity.turnoverRate).toBe(3.46);
    });

    it('should have correct field types and constraints', () => {
      const entity = new KlineExtensionEf();

      expect(entity.id).toBeDefined();
      expect(entity.amplitude).toBeDefined();
      expect(entity.changePct).toBeDefined();
      expect(entity.changeAmt).toBeDefined();
      expect(entity.turnoverRate).toBeDefined();
      expect(entity.createTime).toBeDefined();
    });

    it('should allow undefined values for optional fields', () => {
      const entityData = {
        amplitude: undefined,
        changePct: undefined,
        changeAmt: undefined,
        turnoverRate: undefined,
      };

      const entity = repository.create(entityData);

      expect(entity.amplitude).toBeUndefined();
      expect(entity.changePct).toBeUndefined();
      expect(entity.changeAmt).toBeUndefined();
      expect(entity.turnoverRate).toBeUndefined();
    });
  });

  describe('Entity Validation', () => {
    it('should accept valid decimal values', () => {
      const entityData = {
        amplitude: 5.23,
        changePct: 2.15,
        changeAmt: 15.3,
        turnoverRate: 3.46,
      };

      const entity = repository.create(entityData);

      expect(entity.amplitude).toBe(5.23);
      expect(entity.changePct).toBe(2.15);
      expect(entity.changeAmt).toBe(15.3);
      expect(entity.turnoverRate).toBe(3.46);
    });

    it('should handle edge cases for percentage values', () => {
      const testCases = [
        { amplitude: 0, changePct: -10.5, changeAmt: -50.0, turnoverRate: 0 },
        {
          amplitude: 20.0,
          changePct: 10.0,
          changeAmt: 100.0,
          turnoverRate: 100.0,
        },
      ];

      testCases.forEach((entityData) => {
        const entity = repository.create(entityData);
        expect(entity.amplitude).toBe(entityData.amplitude);
        expect(entity.changePct).toBe(entityData.changePct);
        expect(entity.changeAmt).toBe(entityData.changeAmt);
        expect(entity.turnoverRate).toBe(entityData.turnoverRate);
      });
    });
  });
});
