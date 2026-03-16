import { Test, TestingModule } from '@nestjs/testing';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { ConfigService } from '@nestjs/config';

describe('LlmController', () => {
  let controller: LlmController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LlmController],
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementationOnce((key: string) => {
              if (key === 'REASONING_MODEL') return 'test-model';
              if (key === 'REASONING_BASE_URL') return 'http://test.com';
              if (key === 'REASONING_API_KEY') return 'test-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<LlmController>(LlmController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
