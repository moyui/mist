import { Test, TestingModule } from '@nestjs/testing';
import { DataService } from './data.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, MarketDataBar } from '@app/shared-data';

describe('DataService', () => {
  let service: DataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataService,
        {
          provide: getRepositoryToken(Security),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MarketDataBar),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataService>(DataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
