import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { TimezoneService } from '@app/timezone';
import { VisualCommandService } from '@app/visual-command';
import { prepareMarketData } from '@app/market-data';
import type { ChanK } from '@app/chancore';
import { IndicatorService } from '../indicator/indicator.service';
import { QueryVisualCommandsDto } from './dto/query-visual-commands.dto';
import { VisualCommandPayloadVo } from './vo/visual-command.vo';

@ApiTags('visual')
@Controller('v1/visual')
export class VisualController {
  private readonly logger = new Logger(VisualController.name);

  constructor(
    private readonly visualCommandService: VisualCommandService,
    private readonly indicatorService: IndicatorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  @Get('commands')
  @ApiOperation({
    summary: '获取统一绘图指令流',
    description:
      '供 QMT / TDX 终端极简执行器调用的通用绘图指令接口，按请求图层批量返回折线、区间带与买卖点标记。以时间窗口为唯一真源，不做 count 尾部裁剪。',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description: '成功返回通用绘图指令集合',
    type: VisualCommandPayloadVo,
  })
  async getCommands(@Query() query: QueryVisualCommandsDto) {
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

    // 统一走全局 market-data pipeline：精度门控(KPriceProjector) → 补齐(Imputer) → 视图
    // - 精度：KPriceProjector 对 string DECIMAL(20,2) 做校验，异常整根 dropped；number 已在 DB 侧 toFixed(2) 无损
    // - 补齐：Imputer 对 OHLC/量额缺失做 backfilled/forwardFilled/unavailable，跨日不补
    // - 非法数据修复+数据补全一口气在 pipeline 内完成，历史/实时/展示/指标同一份代码
    // Imputer 要求严格递增时间戳，DB 侧已保证有序，但测试/容错侧先排序去重
    const sortedEntities = [...kEntities]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .filter(
        (item, idx, arr) =>
          idx === 0 ||
          item.timestamp.getTime() !== arr[idx - 1].timestamp.getTime(),
      );
    const pipeline = prepareMarketData({
      rawBars: sortedEntities,
      period: query.period,
      requiredBars: sortedEntities.length || 1,
      windowStartAt: startDate,
      windowEndAt: endDate,
    });

    if (pipeline.droppedKlines > 0) {
      this.logger.warn(
        `visual pipeline dropped ${pipeline.droppedKlines}/${pipeline.requestedKlines} bars code=${query.code} period=${query.period} source=${query.source ?? 'default'} resolutions=${JSON.stringify(pipeline.diagnostics.resolutionCounts)}`,
      );
    }

    // pipeline.projected 是 Imputer 后的 effective 视图，转 ChanK 供 visual-command 消费
    const chanKlines: ChanK[] = pipeline.projected
      .filter((bar) => bar.ohlc.effective !== null)
      .map((bar, idx) => ({
        id: idx + 1,
        symbol: query.code,
        time: bar.rawBar.timestamp,
        open: bar.ohlc.effective!.open,
        high: bar.ohlc.effective!.high,
        low: bar.ohlc.effective!.low,
        close: bar.ohlc.effective!.close,
        volume: bar.volume.effective,
        amount: bar.amount.effective,
      }));

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
