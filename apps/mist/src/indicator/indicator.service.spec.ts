import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorService } from './indicator.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, K } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

describe('IndicatorService', () => {
  let service: IndicatorService;

  const mockSecurityRepository = {
    find: jest.fn(),
  };

  const mockKRepository = {
    find: jest.fn(),
  };

  const mockDataSourceService = {
    select: jest.fn().mockReturnValue('ef'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicatorService,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(K),
          useValue: mockKRepository,
        },
        {
          provide: DataSourceService,
          useValue: mockDataSourceService,
        },
      ],
    }).compile();

    service = module.get<IndicatorService>(IndicatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
