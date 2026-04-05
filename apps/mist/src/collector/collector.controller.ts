import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CollectDto } from './dto/collect.dto';
import { CollectionStrategyRegistry } from './strategies/collection-strategy.registry';
import { SecurityService } from '../security/security.service';
import { TimezoneService } from '@app/timezone';

@ApiTags('collector v1')
@Controller('v1/collector')
export class CollectorController {
  private readonly logger = new Logger(CollectorController.name);

  constructor(
    private readonly securityService: SecurityService,
    private readonly registry: CollectionStrategyRegistry,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发K线数据采集' })
  async collect(
    @Body() dto: CollectDto,
  ): Promise<{ code: string; period: number; count: number }> {
    // 1. Resolve security (throws NotFoundException if not found)
    const security = await this.securityService.findSecurityByCode(dto.code);

    // 2. Validate source against security's configured sources
    const sourceConfigs = await this.securityService.getSecuritySources(
      dto.code,
    );
    const enabledSources = sourceConfigs.filter((c) => c.enabled);

    if (enabledSources.length === 0) {
      throw new BadRequestException(
        `No enabled data source configured for security: ${dto.code}`,
      );
    }

    if (dto.source) {
      const matched = enabledSources.find((c) => c.source === dto.source);
      if (!matched) {
        const configuredSources = enabledSources
          .map((c) => c.source)
          .join(', ');
        throw new BadRequestException(
          `Source mismatch: requested '${dto.source}', but security ${dto.code} only has configured sources: ${configuredSources}`,
        );
      }
    }

    // 3. Resolve strategy and collect with user-provided dates
    const strategy = this.registry.resolve(dto.source);
    const startDate = this.timezoneService.parseDateString(dto.startDate);
    const endDate = this.timezoneService.parseDateString(dto.endDate);

    const count = await strategy.collectForSecurity(
      security,
      dto.period,
      startDate,
      endDate,
    );

    return { code: dto.code, period: dto.period, count };
  }
}
