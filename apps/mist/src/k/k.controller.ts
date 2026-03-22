import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { KlineQueryDto } from './dto/query/kline-query.dto';
import { KService } from './k.service';
import { BarsVo } from './vo/bars.vo';

@ApiTags('market-data')
@Controller('market-data')
export class KController {
  constructor(private readonly kService: KService) {}

  @Post('bars')
  @ApiOperation({
    summary: 'Query market data bars',
    description:
      'Retrieves K-line (bar) data for the specified symbol and time range',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns array of market data bars with open, high, low, close, and volume',
    type: [BarsVo],
  })
  async queryBars(@Body() klineQueryDto: KlineQueryDto): Promise<BarsVo[]> {
    const bars = await this.kService.findBarsById(klineQueryDto);
    return bars.map((bar) => ({
      id: bar.id,
      highest: bar.high,
      lowest: bar.low,
      open: bar.open,
      close: bar.close,
      symbol: bar.security.code,
      timestamp: bar.timestamp,
      amount: bar.amount,
    }));
  }
}
