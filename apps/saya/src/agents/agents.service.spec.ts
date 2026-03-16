import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { LlmService } from '../llm/llm.service';
import { ToolsService } from '../tools/tools.service';
import { ConfigService } from '@nestjs/config';

// Mock for LangChain's ChatDeepSeek
const mockChatDeepSeek = {
  withStructuredOutput: jest.fn(() => ({
    invoke: jest.fn(),
  })),
};

describe('AgentsService', () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: LlmService,
          useValue: {
            getLLMByType: jest.fn().mockReturnValue(mockChatDeepSeek),
          },
        },
        {
          provide: ToolsService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementationOnce((key: string) => {
              if (key === 'agents') return { Commander: 'basic' };
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
