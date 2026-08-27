import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { TimezoneService } from '@app/timezone';
import { VisualCommandService } from '@app/visual-command';
import { IndicatorService } from '../indicator/indicator.service';
import { QueryVisualCommandsDto } from './dto/query-visual-commands.dto';
import { VisualCommandPayloadVo } from './vo/visual-command.vo';

@ApiTags('visual')
@Controller('v1/visual')
export class VisualController {
  constructor(
    private readonly visualCommandService: VisualCommandService,
    private readonly indicatorService: IndicatorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Get('commands')
  @ApiOperation({
    summary: '获取统一绘图指令流',
    description:
      '供 QMT / TDX 终端极简执行器调用的通用绘图指令接口，按请求图层批量返回折线、区间带与买卖点标记',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description: '成功返回通用绘图指令集合',
    type: VisualCommandPayloadVo,
  })
  async getCommands(@Query() query: QueryVisualCommandsDto) {
    const count = query.count ?? 500;
    const now = new Date();
    const endDate = query.endDate
      ? this.timezoneService.parseDateString(query.endDate)
      : now;

    // Default to a 60-day window if no startDate is provided
    const startDate = query.startDate
      ? this.timezoneService.parseDateString(query.startDate)
      : new Date(endDate.getTime() - 60 * 24 * 3600 * 1000);

    const kEntities = await this.indicatorService.findKData({
      code: query.code,
      period: query.period,
      startDate,
      endDate,
      source: query.source,
    });

    // Take the last `count` items
    const sliced =
      kEntities.length > count ? kEntities.slice(-count) : kEntities;

    const chanKlines = sliced
      .map((k) => ({
        id: k.id,
        symbol: k.security?.code ?? query.code,
        time: k.timestamp,
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume:
          k.volume !== null && k.volume !== undefined ? String(k.volume) : null,
        amount:
          k.amount !== null && k.amount !== undefined ? String(k.amount) : null,
      }))
      .filter(
        (k) =>
          Number.isFinite(k.open) &&
          Number.isFinite(k.high) &&
          Number.isFinite(k.low) &&
          Number.isFinite(k.close),
      );

    const requestedLayers = query.layers
      ? query.layers.split(',').map((s) => s.trim())
      : ['chan'];

    return this.visualCommandService.generateCommands({
      code: query.code,
      period: query.period,
      source: query.source ?? 'default',
      klines: chanKlines,
      layers: requestedLayers,
    });
  }
}
