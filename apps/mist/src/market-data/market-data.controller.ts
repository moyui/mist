import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueryBarsDto } from './dto/query-bars.dto';
import { MarketDataService } from './market-data.service';
import { BarsVo } from './vo/bars.vo';

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

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
  async queryBars(@Body() queryBarsDto: QueryBarsDto): Promise<BarsVo[]> {
    const bars = await this.marketDataService.findBarsById(queryBarsDto);
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
