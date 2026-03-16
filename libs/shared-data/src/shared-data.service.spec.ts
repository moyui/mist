import { Test, TestingModule } from '@nestjs/testing';
import { SharedDataService } from './shared-data.service';
import { HttpService } from '@nestjs/axios';
import { TimezoneService } from '@app/timezone';
import { UtilsService } from '@app/utils';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IndexData, IndexPeriod, IndexDaily } from './entities';

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
          provide: getRepositoryToken(IndexData),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(IndexPeriod),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(IndexDaily),
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
});
