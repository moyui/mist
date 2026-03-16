import { Test, TestingModule } from '@nestjs/testing';
import { RunController } from './run.controller';
import { SharedDataService } from '@app/shared-data';
import { TaskService } from '../task/task.service';
import { TimezoneService } from '@app/timezone';
import { UtilsService } from '@app/utils';

describe('RunController', () => {
  let controller: RunController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunController],
      providers: [
        {
          provide: SharedDataService,
          useValue: {
            handleCronIsTradingDay: jest.fn(),
            handleCron1MinIndex: jest.fn(),
            handleCron5MinIndex: jest.fn(),
            handleCron15MinIndex: jest.fn(),
            handleCron30MinIndex: jest.fn(),
            handleCron60MinIndex: jest.fn(),
          },
        },
        {
          provide: TaskService,
          useValue: {},
        },
        {
          provide: TimezoneService,
          useValue: {},
        },
        {
          provide: UtilsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<RunController>(RunController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
