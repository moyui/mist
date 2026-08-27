import { Controller, Get, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';
import { RawResponse } from '@app/transport/http';
import { RealtimeRedisService } from '../realtime/realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';
import { RuntimeConfigService } from '../realtime-subscriptions/runtime-config.service';
import { BackendHealthVo } from './health.vo';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RealtimeRedisService,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    @Optional() private readonly runtimeConfig?: RuntimeConfigService,
  ) {}

  @Get('health')
  @RawResponse()
  @ApiOperation({
    summary: 'Backend runtime health and switches',
    description:
      'Provides structured visibility into active runtime flags, Redis availability, and security allowlist',
  })
  @ApiResponse({ status: 200, type: BackendHealthVo })
  getHealth(): BackendHealthVo {
    const rawProd =
      this.config.get<string>('REALTIME_PRODUCTIZATION_MODE') ?? 'off';
    const prodMode = rawProd === 'on' || rawProd === 'shadow' ? rawProd : 'off';

    const rawStrat = this.config.get<string>('REALTIME_STRATEGY_MODE') ?? 'off';
    const stratMode =
      rawStrat === 'on' || rawStrat === 'shadow' ? rawStrat : 'off';

    const allowlistCount =
      this.allowlist.assignedCountFor(DataSource.TDX) +
      this.allowlist.assignedCountFor(DataSource.QMT);

    return {
      status: 'ok',
      service: 'mist-backend',
      instance: 'backend',
      timestamp: new Date().toISOString(),
      productizationMode: prodMode,
      strategyMode: stratMode,
      redisAvailable: this.redis.isAvailable(),
      allowlistCount,
      autoReconcile: this.runtimeConfig?.getAutoReconcileCached() ?? false,
    };
  }
}
