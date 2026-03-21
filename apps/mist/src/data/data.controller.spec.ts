import { Test, TestingModule } from '@nestjs/testing';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { SharedDataService } from '@app/shared-data';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, MarketDataBar } from '@app/shared-data';

describe('DataController', () => {
  let controller: DataController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataController],
      providers: [
        {
          provide: DataService,
          useValue: {
            initData: jest.fn(),
            index: jest.fn(),
            findBarsById: jest.fn(),
          },
        },
        {
          provide: SharedDataService,
          useValue: {
            cronIndexPeriod: jest.fn(),
            cronIndexDaily: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Security),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MarketDataBar),
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DataController>(DataController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
