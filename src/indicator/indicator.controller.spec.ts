import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

describe('IndicatorController', () => {
  let controller: IndicatorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IndicatorController],
      providers: [IndicatorService],
    }).compile();

    controller = module.get<IndicatorController>(IndicatorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
