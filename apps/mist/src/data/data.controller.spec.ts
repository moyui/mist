import { Test, TestingModule } from '@nestjs/testing';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { SharedDataService } from '@app/shared-data';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IndexData, IndexPeriod, IndexDaily } from '@app/shared-data';

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
            findIndexPeriodById: jest.fn(),
          },
        },
        {
          provide: SharedDataService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(IndexData),
          useValue: {},
        },
        {
          provide: getRepositoryToken(IndexPeriod),
          useValue: {},
        },
        {
          provide: getRepositoryToken(IndexDaily),
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
