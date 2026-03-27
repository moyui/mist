import { Test, TestingModule } from '@nestjs/testing';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Security, SecurityType, DataSource } from '@app/shared-data';

const mockSecurityService = {
  initializeSecurity: jest.fn(),
  addSecuritySource: jest.fn(),
  findSecurityByCode: jest.fn(),
  findAll: jest.fn(),
  deactivateSecurity: jest.fn(),
  activateSecurity: jest.fn(),
  getSecuritySources: jest.fn(),
};

describe('SecurityController', () => {
  let controller: SecurityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
      ],
    }).compile();

    controller = module.get<SecurityController>(SecurityController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeSecurity', () => {
    const initSecurityDto: InitSecurityDto = {
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
    };

    const mockSecurity: Security = {
      id: 1,
      code: '600000',
      name: '浦发银行',
      type: SecurityType.STOCK,
      // exchange: 'SH',
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully initialize a new stock', async () => {
      mockSecurityService.initializeSecurity.mockResolvedValue(mockSecurity);

      const result = await controller.initializeSecurity(initSecurityDto);

      expect(result).toEqual(mockSecurity);
      expect(mockSecurityService.initializeSecurity).toHaveBeenCalledWith(
        initSecurityDto,
      );
    });

    it('should throw ConflictException when security already exists', async () => {
      mockSecurityService.initializeSecurity.mockRejectedValue(
        new ConflictException('Security already exists'),
      );

      await expect(
        controller.initializeSecurity(initSecurityDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addSecuritySource', () => {
    const addSecuritySourceDto: AddSecuritySourceDto = {
      code: '600001',
      source: DataSource.EAST_MONEY,
      formatCode: '{}',
    };

    const mockSecurity: Security = {
      id: 1,
      code: '600001',
      name: '测试股票',
      type: SecurityType.STOCK,
      // exchange: 'SH',
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully add source to existing security', async () => {
      mockSecurityService.addSecuritySource.mockResolvedValue(mockSecurity);

      const result = await controller.addSecuritySource(addSecuritySourceDto);

      expect(result).toEqual(mockSecurity);
      expect(mockSecurityService.addSecuritySource).toHaveBeenCalledWith(
        addSecuritySourceDto,
      );
    });

    it('should throw NotFoundException when security not found', async () => {
      mockSecurityService.addSecuritySource.mockRejectedValue(
        new NotFoundException('Security not found'),
      );

      await expect(
        controller.addSecuritySource(addSecuritySourceDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should add source configuration to existing security', async () => {
      // First create security
      const initSecurityDto: InitSecurityDto = {
        code: '600001',
        name: '测试股票',
        type: SecurityType.STOCK,
      };

      mockSecurityService.initializeSecurity.mockResolvedValue(mockSecurity);
      await controller.initializeSecurity(initSecurityDto);

      // Then add source
      mockSecurityService.addSecuritySource.mockResolvedValue(mockSecurity);
      const result = await controller.addSecuritySource(addSecuritySourceDto);

      expect(result).toHaveProperty('code', '600001');
      expect(mockSecurityService.initializeSecurity).toHaveBeenCalledWith(
        initSecurityDto,
      );
      expect(mockSecurityService.addSecuritySource).toHaveBeenCalledWith(
        addSecuritySourceDto,
      );
    });
  });

  describe('findSecurityByCode', () => {
    const mockSecurity: Security = {
      id: 1,
      code: '000001',
      name: '平安银行',
      type: SecurityType.STOCK,
      status: 'ACTIVE' as any,
      sourceConfigs: [],
      ks: [],
      createTime: new Date(),
      updateTime: new Date(),
    };

    it('should successfully get security by code', async () => {
      mockSecurityService.findSecurityByCode.mockResolvedValue(mockSecurity);

      const result = await controller.findSecurityByCode('000001.SH');

      expect(result).toEqual(mockSecurity);
      expect(mockSecurityService.findSecurityByCode).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when security not found', async () => {
      mockSecurityService.findSecurityByCode.mockRejectedValue(
        new NotFoundException('Security not found'),
      );

      await expect(controller.findSecurityByCode('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllSecurities', () => {
    const mockSecurities: Security[] = [
      {
        id: 1,
        code: '000001.SH',
        name: '平安银行',
        type: SecurityType.STOCK,
        status: 'ACTIVE' as any,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      },
      {
        id: 2,
        code: '399006.SZ',
        name: '创业板指',
        type: SecurityType.INDEX,
        status: 'ACTIVE' as any,
        sourceConfigs: [],
        ks: [],
        createTime: new Date(),
        updateTime: new Date(),
      },
    ];

    it('should return all active securities', async () => {
      mockSecurityService.findAll.mockResolvedValue(mockSecurities);

      const result = await controller.getAllSecurities();

      expect(result).toEqual(mockSecurities);
      expect(mockSecurityService.findAll).toHaveBeenCalled();
    });
  });

  describe('deactivateSecurity', () => {
    it('should successfully deactivate a security', async () => {
      mockSecurityService.deactivateSecurity.mockResolvedValue(undefined);

      await expect(
        controller.deactivateSecurity('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockSecurityService.deactivateSecurity).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when security not found', async () => {
      mockSecurityService.deactivateSecurity.mockRejectedValue(
        new NotFoundException('Security not found'),
      );

      await expect(controller.deactivateSecurity('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateSecurity', () => {
    it('should successfully activate a deactivated security', async () => {
      mockSecurityService.activateSecurity.mockResolvedValue(undefined);

      await expect(
        controller.activateSecurity('000001.SH'),
      ).resolves.not.toThrow();
      expect(mockSecurityService.activateSecurity).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when security not found', async () => {
      mockSecurityService.activateSecurity.mockRejectedValue(
        new NotFoundException('Security not found'),
      );

      await expect(controller.activateSecurity('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSecuritySources', () => {
    it('should successfully get source configuration', async () => {
      const mockSource = { type: DataSource.EAST_MONEY, config: '{}' };
      mockSecurityService.getSecuritySources.mockResolvedValue(mockSource);

      const result = await controller.getSecuritySources('000001.SH');

      expect(result).toEqual(mockSource);
      expect(mockSecurityService.getSecuritySources).toHaveBeenCalledWith(
        '000001.SH',
      );
    });

    it('should throw NotFoundException when security not found', async () => {
      mockSecurityService.getSecuritySources.mockRejectedValue(
        new NotFoundException('Security not found'),
      );

      await expect(controller.getSecuritySources('999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
