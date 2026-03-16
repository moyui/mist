import { Test, TestingModule } from '@nestjs/testing';
import { KMergeService } from './k-merge.service';
import { TrendService } from '../../trend/trend.service';

describe('KMergeService', () => {
  let service: KMergeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KMergeService,
        {
          provide: TrendService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<KMergeService>(KMergeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
