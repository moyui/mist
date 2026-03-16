import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';
import { HttpService } from '@nestjs/axios';
import { UtilsService } from '@app/utils';

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<ToolsService>(ToolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
