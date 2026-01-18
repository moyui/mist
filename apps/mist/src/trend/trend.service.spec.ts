import { Test, TestingModule } from '@nestjs/testing';
import { TrendService } from './trend.service';

describe('TrendService', () => {
  let service: TrendService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrendService],
    }).compile();

    service = module.get<TrendService>(TrendService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
