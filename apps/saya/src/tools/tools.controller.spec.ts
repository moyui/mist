import { Test, TestingModule } from '@nestjs/testing';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { HttpService } from '@nestjs/axios';
import { UtilsService } from '@app/utils';

describe('ToolsController', () => {
  let controller: ToolsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToolsController],
      providers: [
        ToolsService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
        {
          provide: UtilsService,
          useValue: {
            getLocalUrl: jest
              .fn()
              .mockReturnValue('http://localhost:3000/indicator/test'),
            formatLocalResult: jest.fn().mockReturnValue('{}'),
          },
        },
      ],
    }).compile();

    controller = module.get<ToolsController>(ToolsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
