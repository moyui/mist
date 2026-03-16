import { Test, TestingModule } from '@nestjs/testing';
import { TrendService } from './trend.service';
import { UtilsService } from '@app/utils';

describe('TrendService', () => {
  let service: TrendService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendService,
        {
          provide: UtilsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<TrendService>(TrendService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
