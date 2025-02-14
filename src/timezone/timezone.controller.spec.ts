import { Test, TestingModule } from '@nestjs/testing';
import { TimezoneController } from './timezone.controller';
import { TimezoneService } from './timezone.service';

describe('TimezoneController', () => {
  let controller: TimezoneController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimezoneController],
      providers: [TimezoneService],
    }).compile();

    controller = module.get<TimezoneController>(TimezoneController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
