import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';
import { DataService } from '../data/data.service';
import { TimezoneService } from '@app/timezone';

describe('IndicatorController', () => {
  let controller: IndicatorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndicatorController],
      providers: [
        IndicatorService,
        {
          provide: DataService,
          useValue: {},
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
