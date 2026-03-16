import { Test, TestingModule } from '@nestjs/testing';
import { RoleService } from './role.service';
import { TemplateService } from '../template/template.service';
import { LlmService } from '../llm/llm.service';
import { ConfigService } from '@nestjs/config';

describe('RoleService', () => {
  let service: RoleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: TemplateService,
          useValue: {
            applyPromptTemplate: jest.fn(),
          },
        },
        {
          provide: LlmService,
          useValue: {
            getLLMByType: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementationOnce((key: string) => {
              if (key === 'agents') return { Commander: 'Basic' };
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
