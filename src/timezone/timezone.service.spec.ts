import { Test, TestingModule } from '@nestjs/testing';
import { TimezoneService } from './timezone.service';

describe('TimezoneService', () => {
  let service: TimezoneService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimezoneService],
    }).compile();

    service = module.get<TimezoneService>(TimezoneService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
