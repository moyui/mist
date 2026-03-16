import { Test, TestingModule } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
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

describe('AgentsController', () => {
  let controller: AgentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
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

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
