import { Test, TestingModule } from '@nestjs/testing';
import { SharedDataService } from './shared-data.service';
import { HttpService } from '@nestjs/axios';
import { TimezoneService } from '@app/timezone';
import { UtilsService } from '@app/utils';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, MarketDataBar } from '@app/shared-data';

describe('SharedDataService', () => {
  let service: SharedDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedDataService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
        {
          provide: TimezoneService,
          useValue: {},
        },
        {
          provide: UtilsService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(Security),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MarketDataBar),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SharedDataService>(SharedDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cronIndexPeriod', () => {
    it('should throw NotImplementedException', async () => {
      await expect(service.cronIndexPeriod({} as any)).rejects.toThrow(
        'cronIndexPeriod needs to be rewritten',
      );
    });
  });

  describe('cronIndexDaily', () => {
    it('should throw NotImplementedException', async () => {
      await expect(service.cronIndexDaily({} as any)).rejects.toThrow(
        'cronIndexDaily needs to be rewritten',
      );
    });
  });
});
