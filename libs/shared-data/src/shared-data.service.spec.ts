import { Test, TestingModule } from '@nestjs/testing';
import { SharedDataService } from './shared-data.service';

describe('SharedDataService', () => {
  let service: SharedDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharedDataService],
    }).compile();

    service = module.get<SharedDataService>(SharedDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
