import { Test, TestingModule } from '@nestjs/testing';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';

describe('ChanController', () => {
  let controller: ChanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChanController],
      providers: [ChanService],
    }).compile();

    controller = module.get<ChanController>(ChanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
