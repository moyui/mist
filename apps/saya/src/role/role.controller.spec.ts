import { Test, TestingModule } from '@nestjs/testing';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { TemplateService } from '../template/template.service';
import { LlmService } from '../llm/llm.service';
import { ConfigService } from '@nestjs/config';

describe('RoleController', () => {
  let controller: RoleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
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

    controller = module.get<RoleController>(RoleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
