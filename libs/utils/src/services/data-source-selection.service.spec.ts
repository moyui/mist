import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSourceSelectionService } from './data-source-selection.service';
import { Security, SecuritySourceConfig, DataSource } from '@app/shared-data';
import { DataSourceService } from './data-source.service';

describe('DataSourceSelectionService', () => {
  let service: DataSourceSelectionService;
  let mockSourceConfigRepository: jest.Mocked<Repository<SecuritySourceConfig>>;
  let mockDataSourceService: jest.Mocked<DataSourceService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSourceSelectionService,
        {
          provide: getRepositoryToken(SecuritySourceConfig),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: DataSourceService,
          useValue: {
            getDefault: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataSourceSelectionService>(
      DataSourceSelectionService,
    );
    mockSourceConfigRepository = module.get(
      getRepositoryToken(SecuritySourceConfig),
    );
    mockDataSourceService = module.get(DataSourceService);
  });

  it('should return configured source when SecuritySourceConfig exists', async () => {
    const security = { id: 1, code: 'TEST001' } as Security;
    const configs = [
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: true,
        formatCode: 'test',
      },
    ];

    mockSourceConfigRepository.find.mockResolvedValue(configs as any);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.TDX);
    expect(mockSourceConfigRepository.find).toHaveBeenCalledWith({
      where: {
        security: { id: security.id },
        enabled: true,
      },
      relations: ['security'],
      order: {
        priority: 'DESC',
      },
    });
  });

  it('should return global default when no config exists', async () => {
    const security = { id: 1, code: 'TEST002' } as Security;
    mockSourceConfigRepository.find.mockResolvedValue([]);
    mockDataSourceService.getDefault.mockReturnValue(DataSource.EAST_MONEY);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.EAST_MONEY);
    expect(mockDataSourceService.getDefault).toHaveBeenCalled();
  });

  it('should return highest priority source when multiple configs exist', async () => {
    const security = { id: 1, code: 'TEST003' } as Security;
    const configs = [
      {
        security,
        source: DataSource.TDX,
        priority: 10,
        enabled: true,
        formatCode: 'test',
      },
      {
        security,
        source: DataSource.EAST_MONEY,
        priority: 5,
        enabled: true,
        formatCode: 'test',
      },
    ];

    mockSourceConfigRepository.find.mockResolvedValue(configs as any);

    const result = await service.getDataSourceForSecurity(security);

    expect(result).toBe(DataSource.TDX);
  });
});
