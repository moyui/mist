import { Test, TestingModule } from '@nestjs/testing';
import { ChanService } from './chan.service';

describe('ChanService', () => {
  let service: ChanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChanService],
    }).compile();

    service = module.get<ChanService>(ChanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
