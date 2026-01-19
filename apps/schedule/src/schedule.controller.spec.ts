import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

describe('ScheduleController', () => {
  let scheduleController: ScheduleController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [ScheduleService],
    }).compile();

    scheduleController = app.get<ScheduleController>(ScheduleController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(scheduleController.getHello()).toBe('Hello World!');
    });
  });
});
