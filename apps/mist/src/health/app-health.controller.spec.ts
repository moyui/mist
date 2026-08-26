import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppHealthController } from './app-health.controller';
import { RealtimeRedisService } from '../realtime/realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';

describe('AppHealthController', () => {
  let controller: AppHealthController;
  let mockConfigService: { get: jest.Mock };
  let mockRedisService: { isAvailable: jest.Mock };
  let mockAllowlistService: { assignedCountFor: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    };
    mockRedisService = {
      isAvailable: jest.fn().mockReturnValue(true),
    };
    mockAllowlistService = {
      assignedCountFor: jest.fn().mockReturnValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppHealthController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RealtimeRedisService, useValue: mockRedisService },
        {
          provide: RealtimeSecurityAllowlistService,
          useValue: mockAllowlistService,
        },
      ],
    }).compile();

    controller = module.get<AppHealthController>(AppHealthController);
  });

  it('should return on mode when configured as on', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'REALTIME_PRODUCTIZATION_MODE') return 'on';
      if (key === 'REALTIME_STRATEGY_MODE') return 'on';
      return undefined;
    });

    const result = controller.getHealth();
    expect(result).toEqual({
      status: 'ok',
      instance: 'backend',
      productizationMode: 'on',
      strategyMode: 'on',
      redisAvailable: true,
      allowlistCount: 4,
    });
  });

  it('should return shadow mode when configured as shadow', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'REALTIME_PRODUCTIZATION_MODE') return 'shadow';
      if (key === 'REALTIME_STRATEGY_MODE') return 'shadow';
      return undefined;
    });

    const result = controller.getHealth();
    expect(result.productizationMode).toBe('shadow');
    expect(result.strategyMode).toBe('shadow');
  });

  it('should fallback to off when unconfigured or invalid', () => {
    mockConfigService.get.mockReturnValue(undefined);
    mockRedisService.isAvailable.mockReturnValue(false);
    mockAllowlistService.assignedCountFor.mockReturnValue(0);

    const result = controller.getHealth();
    expect(result).toEqual({
      status: 'ok',
      instance: 'backend',
      productizationMode: 'off',
      strategyMode: 'off',
      redisAvailable: false,
      allowlistCount: 0,
    });
  });
});
