import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SecurityService } from './security.service';
import {
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import { DataSource } from '@app/shared-data';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { HttpBusinessRejection } from '@app/transport/http';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { RealtimeSubscriptionLifecycleCoordinator } from '../realtime-subscriptions/realtime-subscription-lifecycle.coordinator';

describe('SecurityService', () => {
  let service: SecurityService;

  const mockSecurityRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn((entity) => entity),
  };

  const mockAssignmentRepository = {
    findOne: jest.fn(),
  };

  const mockLifecycleCoordinator = {
    refreshDesiredState: jest.fn().mockResolvedValue(undefined),
    requestIncrementalReconciliation: jest.fn(),
  };

  const mockManager = {
    findOne: jest.fn((entity, options) => {
      const withoutLock = { ...options };
      delete withoutLock.lock;
      if (entity === Security) {
        return mockSecurityRepository.findOne(withoutLock);
      }
      if (entity === SecuritySourceConfig) {
        return mockSourceConfigRepository.findOne(withoutLock);
      }
      if (entity === RealtimeSubscriptionAssignment) {
        return mockAssignmentRepository.findOne(withoutLock);
      }
      throw new Error('Unexpected entity');
    }),
    create: jest.fn((entity, value) => {
      if (entity === Security) return mockSecurityRepository.create(value);
      if (entity === SecuritySourceConfig) {
        return mockSourceConfigRepository.create(value);
      }
      return value;
    }),
    save: jest.fn((value) => {
      if (value && 'source' in value) {
        return mockSourceConfigRepository.save(value);
      }
      return mockSecurityRepository.save(value);
    }),
    delete: jest.fn((entity, criteria) => {
      if (entity === SecuritySourceConfig) {
        return mockSourceConfigRepository.delete(criteria);
      }
      throw new Error('Unexpected delete entity');
    }),
    getRepository: jest.fn(),
    update: jest.fn(),
  };

  const mockTypeOrmDataSource = {
    transaction: jest.fn((callback) => callback(mockManager)),
  };

  const mockSourceConfigRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((entity) => entity),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        {
          provide: TypeOrmDataSource,
          useValue: mockTypeOrmDataSource,
        },
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(SecuritySourceConfig),
          useValue: mockSourceConfigRepository,
        },
        {
          provide: getRepositoryToken(RealtimeSubscriptionAssignment),
          useValue: mockAssignmentRepository,
        },
        {
          provide: RealtimeSubscriptionLifecycleCoordinator,
          useValue: mockLifecycleCoordinator,
        },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
    mockSecurityRepository.create.mockImplementation((entity) => entity);
    mockSourceConfigRepository.create.mockImplementation((entity) => entity);
    mockSourceConfigRepository.findOne.mockResolvedValue(null);
    mockAssignmentRepository.findOne.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('formatCode', () => {
    it('should normalize provider-formatted codes to canonical internal codes', () => {
      const result = service['formatCode']('  000001.sh  ');
      expect(result).toBe('000001');
    });
  });

  describe('initializeSecurity', () => {
    it('should create a stock without source config or data collection', async () => {
      const initSecurityDto: InitSecurityDto = {
        code: '600000.SH',
        name: '浦发银行',
        type: SecurityType.STOCK,
      };

      mockSecurityRepository.findOne.mockResolvedValue(null);
      mockSecurityRepository.create.mockReturnValue({
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security);
      mockSecurityRepository.save.mockResolvedValue({
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security);

      const result = await service.initializeSecurity(initSecurityDto);

      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '600000' },
      });
      expect(mockSecurityRepository.create).toHaveBeenCalledWith({
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      });
      expect(result).toBeDefined();
      expect(result.code).toBe('600000');
      expect(result.type).toBe(SecurityType.STOCK);
    });

    it('should throw ConflictException if stock already exists', async () => {
      const initSecurityDto: InitSecurityDto = {
        code: 'SH600000',
        type: SecurityType.STOCK,
      };

      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '600000',
      } as Security);

      await expect(service.initializeSecurity(initSecurityDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '600000' },
      });
    });
  });

  describe('addSecuritySource', () => {
    it('should create source config for existing stock', async () => {
      const addSecuritySourceDto: AddSecuritySourceDto = {
        code: '600000.SH',
        source: DataSource.EAST_MONEY,
        formatCode: 'sh600000',
      };

      const mockSecurity = {
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security;

      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);
      mockSourceConfigRepository.create.mockReturnValue({
        security: mockSecurity,
        source: DataSource.EAST_MONEY,
        formatCode: 'sh600000',
        priority: 0,
        enabled: true,
      } as SecuritySourceConfig);
      mockSourceConfigRepository.save.mockResolvedValue(
        {} as SecuritySourceConfig,
      );

      const result = await service.addSecuritySource(addSecuritySourceDto);

      expect(result).toEqual(mockSecurity);
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '600000' },
      });
      expect(mockSourceConfigRepository.findOne).toHaveBeenCalledWith({
        where: { securityId: 1, source: DataSource.EAST_MONEY },
      });
      expect(mockSourceConfigRepository.create).toHaveBeenCalledWith({
        security: mockSecurity,
        securityId: mockSecurity.id,
        source: DataSource.EAST_MONEY,
        formatCode: 'sh600000',
        priority: 0,
        enabled: true,
      });
      expect(mockSourceConfigRepository.save).toHaveBeenCalled();
    });

    it('should update existing source config instead of creating duplicates', async () => {
      const addSecuritySourceDto: AddSecuritySourceDto = {
        code: 'SH600000',
        source: DataSource.TDX,
        formatCode: '600000.SH',
        priority: 100,
        enabled: false,
      };
      const mockSecurity = {
        id: 1,
        code: '600000',
        name: '浦发银行',
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      } as Security;
      const existingSourceConfig = {
        id: 10,
        securityId: 1,
        security: mockSecurity,
        source: DataSource.TDX,
        formatCode: 'OLD',
        priority: 0,
        enabled: true,
      } as SecuritySourceConfig;

      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);
      mockSourceConfigRepository.findOne.mockResolvedValue(
        existingSourceConfig,
      );
      mockSourceConfigRepository.save.mockResolvedValue(existingSourceConfig);

      const result = await service.addSecuritySource(addSecuritySourceDto);

      expect(result).toEqual(mockSecurity);
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '600000' },
      });
      expect(mockSourceConfigRepository.findOne).toHaveBeenCalledWith({
        where: { securityId: 1, source: DataSource.TDX },
      });
      expect(mockSourceConfigRepository.create).not.toHaveBeenCalled();
      expect(mockSourceConfigRepository.save).toHaveBeenCalledWith({
        ...existingSourceConfig,
        formatCode: '600000.SH',
        priority: 100,
        enabled: false,
      });
    });

    it('should throw NotFoundException if stock not found', async () => {
      const addSecuritySourceDto: AddSecuritySourceDto = {
        code: '999999',
        source: DataSource.EAST_MONEY,
        formatCode: 'sh999999',
      };

      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addSecuritySource(addSecuritySourceDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an enabled source with an empty provider symbol', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '600000',
      } as Security);
      await expect(
        service.addSecuritySource({
          code: '600000',
          source: DataSource.EAST_MONEY,
          formatCode: '   ',
          enabled: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockSourceConfigRepository.save).not.toHaveBeenCalled();
    });

    it.each([
      [DataSource.TDX, '600000'],
      [DataSource.TDX, '600000.sh'],
      [DataSource.QMT, 'SH600000'],
      [DataSource.QMT, 'invalid'],
    ])(
      'rejects malformed enabled %s provider symbol %s',
      async (source, formatCode) => {
        mockSecurityRepository.findOne.mockResolvedValue({
          id: 1,
          code: '600000',
        } as Security);
        await expect(
          service.addSecuritySource({
            code: '600000',
            source,
            formatCode,
            enabled: true,
          }),
        ).rejects.toThrow(BadRequestException);
        expect(mockSourceConfigRepository.save).not.toHaveBeenCalled();
      },
    );

    it('allows an empty provider symbol only while the source is disabled', async () => {
      const mockSecurity = {
        id: 1,
        code: '600000',
      } as Security;
      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);
      mockSourceConfigRepository.save.mockResolvedValue(
        {} as SecuritySourceConfig,
      );

      await service.addSecuritySource({
        code: '600000',
        source: DataSource.TDX,
        enabled: false,
      });

      expect(mockSourceConfigRepository.create).toHaveBeenCalledWith({
        security: mockSecurity,
        securityId: 1,
        source: DataSource.TDX,
        formatCode: '',
        priority: 0,
        enabled: false,
      });
    });

    it('trims a valid provider symbol before persistence', async () => {
      const mockSecurity = {
        id: 1,
        code: '600000',
      } as Security;
      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);
      mockSourceConfigRepository.save.mockResolvedValue(
        {} as SecuritySourceConfig,
      );

      await service.addSecuritySource({
        code: '600000',
        source: DataSource.QMT,
        formatCode: ' 600000.SH ',
      });

      expect(mockSourceConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ formatCode: '600000.SH', enabled: true }),
      );
    });

    it('preserves an existing provider symbol when a partial update omits formatCode', async () => {
      const mockSecurity = {
        id: 1,
        code: '600000',
      } as Security;
      const existingSourceConfig = {
        id: 10,
        securityId: 1,
        source: DataSource.TDX,
        formatCode: '600000.SH',
        priority: 10,
        enabled: false,
      } as SecuritySourceConfig;
      mockSecurityRepository.findOne.mockResolvedValue(mockSecurity);
      mockSourceConfigRepository.findOne.mockResolvedValue(
        existingSourceConfig,
      );
      mockSourceConfigRepository.save.mockResolvedValue(existingSourceConfig);

      await service.addSecuritySource({
        code: '600000',
        source: DataSource.TDX,
        enabled: true,
      });

      expect(mockSourceConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          formatCode: '600000.SH',
          priority: 10,
          enabled: true,
        }),
      );
    });

    it('rejects provider identity changes after assignment', async () => {
      const security = { id: 1, code: '600000' } as Security;
      const sourceConfig = {
        id: 10,
        securityId: 1,
        source: DataSource.TDX,
        formatCode: '600000.SH',
        priority: 10,
        enabled: true,
      } as SecuritySourceConfig;
      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockSourceConfigRepository.findOne.mockResolvedValue(sourceConfig);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
        }),
      );

      const result = await service.addSecuritySource({
        code: '600000',
        source: DataSource.TDX,
        formatCode: '600001.SH',
      });

      expect(result).toBeInstanceOf(HttpBusinessRejection);
      expect(result).toMatchObject({
        code: 'REALTIME_SOURCE_LOCKED',
        data: { assignmentId: 8, securityId: 1, securitySourceConfigId: 10 },
      });
      expect(mockSourceConfigRepository.save).not.toHaveBeenCalled();
    });

    it('permits priority-only updates after assignment', async () => {
      const security = { id: 1, code: '600000' } as Security;
      const sourceConfig = {
        id: 10,
        securityId: 1,
        source: DataSource.TDX,
        formatCode: '600000.SH',
        priority: 10,
        enabled: true,
      } as SecuritySourceConfig;
      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockSourceConfigRepository.findOne.mockResolvedValue(sourceConfig);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
        }),
      );

      const result = await service.addSecuritySource({
        code: '600000',
        source: DataSource.TDX,
        priority: 20,
      });

      expect(result).toBe(security);
      expect(mockSourceConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          formatCode: '600000.SH',
          priority: 20,
          enabled: true,
        }),
      );
    });
  });

  describe('findSecurityByCode', () => {
    it('should return stock by code', async () => {
      const stock = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(stock);

      const result = await service.findSecurityByCode('SH000001');

      expect(result).toEqual(stock);
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
      });
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(service.findSecurityByCode('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return stock even if suspended (status check removed in new implementation)', async () => {
      const suspendedStock = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.SUSPENDED,
        sourceConfigs: [],
        ks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecurityRepository.findOne.mockResolvedValue(suspendedStock);

      const result = await service.findSecurityByCode('000001.SH');

      expect(result).toEqual(suspendedStock);
      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
      });
    });
  });

  describe('getSecuritySources', () => {
    it('should return source configs for existing stock', async () => {
      const stock = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Security;

      const sourceConfigs = [
        {
          id: 1,
          securityId: 1,
          source: DataSource.EAST_MONEY,
          formatCode: '{"base": "shanghai"}',
          priority: 0,
          enabled: true,
        },
      ];

      mockSecurityRepository.findOne.mockResolvedValue(stock);
      mockSourceConfigRepository.find.mockResolvedValue(sourceConfigs);

      const result = await service.getSecuritySources('000001.SH');

      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
      });
      expect(result).toEqual([
        {
          id: 1,
          securityId: 1,
          source: DataSource.EAST_MONEY,
          formatCode: '{"base": "shanghai"}',
          priority: 0,
          enabled: true,
        },
      ]);
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(service.getSecuritySources('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array if no source configs exist', async () => {
      const stock = {
        id: 1,
        code: '000001',
        name: '平安银行',
        type: SecurityType.STOCK,
        exchange: 'SH',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [],
        ks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Security;

      mockSecurityRepository.findOne.mockResolvedValue(stock);
      mockSourceConfigRepository.find.mockResolvedValue([]);

      const result = await service.getSecuritySources('000001.SH');

      expect(mockSecurityRepository.findOne).toHaveBeenCalledWith({
        where: { code: '000001' },
      });
      expect(result).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should return all active stocks', async () => {
      const stocks = [
        {
          id: 1,
          code: '000001',
          name: '平安银行',
          type: SecurityType.STOCK,
          exchange: 'SH',
          status: SecurityStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          code: '399006',
          name: '创业板指',
          type: SecurityType.INDEX,
          exchange: 'SZ',
          status: SecurityStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSecurityRepository.find.mockResolvedValue(stocks);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('000001');
      expect(result[1].code).toBe('399006');
    });
  });

  describe('deactivateSecurity', () => {
    it('should deactivate existing stock', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
      } as Security);
      mockSecurityRepository.update.mockResolvedValue({ affected: 1 });

      await service.deactivateSecurity('000001.SH');

      expect(mockSecurityRepository.update).toHaveBeenCalledWith(
        { code: '000001' },
        { status: SecurityStatus.SUSPENDED },
      );
      expect(
        mockLifecycleCoordinator.requestIncrementalReconciliation,
      ).not.toHaveBeenCalled();
    });

    it('refreshes desired state without requesting provider convergence for an assigned stock', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
      } as Security);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
          sourceConfig: Object.assign(new SecuritySourceConfig(), {
            source: DataSource.QMT,
          }),
        }),
      );
      mockSecurityRepository.update.mockResolvedValue({ affected: 1 });

      await service.deactivateSecurity('000001.SH');

      expect(mockLifecycleCoordinator.refreshDesiredState).toHaveBeenCalledWith(
        DataSource.QMT,
      );
      expect(
        mockLifecycleCoordinator.requestIncrementalReconciliation,
      ).not.toHaveBeenCalled();
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);
      mockSecurityRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.deactivateSecurity('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateSecurity', () => {
    it('should activate existing stock', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        status: SecurityStatus.SUSPENDED,
      } as Security);
      mockSecurityRepository.update.mockResolvedValue({ affected: 1 });

      await service.activateSecurity('000001.SH');

      expect(mockSecurityRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { status: SecurityStatus.ACTIVE },
      );
    });

    it('should throw not found exception if stock does not exist', async () => {
      mockSecurityRepository.findOne.mockResolvedValue(null);

      await expect(service.activateSecurity('000001.SH')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects assigned activation when source capacity is full', async () => {
      mockSecurityRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        status: SecurityStatus.SUSPENDED,
      } as Security);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
          sourceConfig: Object.assign(new SecuritySourceConfig(), {
            source: DataSource.QMT,
          }),
        }),
      );
      const lockBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const countBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5),
      };
      mockManager.getRepository.mockImplementation((entity) => ({
        createQueryBuilder: () =>
          entity === SecuritySourceConfig ? lockBuilder : countBuilder,
      }));

      const result = await service.activateSecurity('000001');

      expect(result).toBeInstanceOf(HttpBusinessRejection);
      expect(result).toMatchObject({
        code: 'REALTIME_ACTIVE_CAPACITY_REACHED',
        data: { source: DataSource.QMT, activeAssignmentCount: 5, limit: 5 },
      });
      expect(lockBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(
        mockLifecycleCoordinator.requestIncrementalReconciliation,
      ).not.toHaveBeenCalled();
    });

    it('requests add-only convergence only after an assigned activation commits', async () => {
      const security = {
        id: 1,
        code: '000001',
        status: SecurityStatus.SUSPENDED,
      } as Security;
      mockSecurityRepository.findOne.mockResolvedValue(security);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
          sourceConfig: Object.assign(new SecuritySourceConfig(), {
            source: DataSource.TDX,
          }),
        }),
      );
      const lockBuilder = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const countBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(4),
      };
      mockManager.getRepository.mockImplementation((entity) => ({
        createQueryBuilder: () =>
          entity === SecuritySourceConfig ? lockBuilder : countBuilder,
      }));

      await service.activateSecurity('000001');

      expect(mockManager.update).toHaveBeenCalledWith(
        Security,
        { id: 1 },
        { status: SecurityStatus.ACTIVE },
      );
      expect(mockLifecycleCoordinator.refreshDesiredState).toHaveBeenCalledWith(
        DataSource.TDX,
      );
      expect(
        mockLifecycleCoordinator.requestIncrementalReconciliation,
      ).toHaveBeenCalledWith(DataSource.TDX);
    });
  });

  describe('deleteSecuritySource', () => {
    it('rejects deleting a source config owned by an assignment', async () => {
      mockSourceConfigRepository.findOne.mockResolvedValue({
        id: 10,
        securityId: 1,
      } as SecuritySourceConfig);
      mockAssignmentRepository.findOne.mockResolvedValue(
        Object.assign(new RealtimeSubscriptionAssignment(), {
          id: 8,
          securityId: 1,
          sourceConfigId: 10,
        }),
      );

      const result = await service.deleteSecuritySource(10, 1);

      expect(result).toBeInstanceOf(HttpBusinessRejection);
      expect(result).toMatchObject({ code: 'REALTIME_SOURCE_LOCKED' });
      expect(mockSourceConfigRepository.delete).not.toHaveBeenCalled();
    });
  });
});
