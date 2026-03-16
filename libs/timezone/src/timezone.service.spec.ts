import { Test, TestingModule } from '@nestjs/testing';
import { TimezoneService } from './timezone.service';
import { HttpService } from '@nestjs/axios';
import { UtilsService } from '@app/utils';

describe('TimezoneService', () => {
  let service: TimezoneService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimezoneService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
            patch: jest.fn(),
          },
        },
        {
          provide: UtilsService,
          useValue: {
            // Mock UtilsService methods if needed
          },
        },
      ],
    }).compile();

    service = module.get<TimezoneService>(TimezoneService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
