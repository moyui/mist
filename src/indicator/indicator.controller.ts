import { Body, Controller, Get, Inject } from '@nestjs/common';
import { DataService } from 'src/data/data.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { MACDDto } from './dto/macd-dto';
import { IndicatorService } from './indicator.service';

@Controller('indicator')
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Inject()
  private dataService: DataService;

  @Inject()
  private timezoneService: TimezoneService;

  @Get('macd')
  async macd(@Body() MACDDto: MACDDto) {
    const startDate = this.timezoneService.convertTimestamp2Date(
      MACDDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(MACDDto.endDate);

    if (MACDDto.daily) {
      const data = await this.dataService.findIndexDailyPriceById({
        symbol: MACDDto.symbol,
        startDate,
        endDate,
      });
      const macd = await this.indicatorService.runMACD(
        data.map((item) => item.price),
      );
      return {
        macd,
        data,
      };
    }
    if (MACDDto.period) {
      const data = await this.dataService.findIndexPeriodPriceById({
        symbol: MACDDto.symbol,
        period: MACDDto.period,
        startDate,
        endDate,
      });
      const macd = await this.indicatorService.runMACD(
        data.map((item) => item.price),
      );
      return {
        macd,
        data,
      };
    }

    return {
      macd: [],
      data: [],
    };
  }
}
