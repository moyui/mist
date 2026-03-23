import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';
import { TimezoneService } from '@app/timezone';
import { DataSourceService } from '@app/utils';
import { getRepositoryToken } from '@nestjs/typeorm';
import { K, Security } from '@app/shared-data';

describe('IndicatorController', () => {
  let controller: IndicatorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndicatorController],
      providers: [
        IndicatorService,
        {
          provide: getRepositoryToken(K),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Security),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
        {
          provide: DataSourceService,
          useValue: {
            select: jest.fn(),
            getDefault: jest.fn(),
          },
        },
        {
          provide: TimezoneService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<IndicatorController>(IndicatorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
