import { Test, TestingModule } from '@nestjs/testing';
import { BuilderService } from './builder.service';

describe('BuilderService', () => {
  let service: BuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BuilderService],
    }).compile();

    service = module.get<BuilderService>(BuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
