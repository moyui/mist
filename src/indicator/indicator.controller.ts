import { Body, Controller, Inject, Post } from '@nestjs/common';
import { DataService } from 'src/data/data.service';
import { IndexVo } from 'src/data/vo/index-vo';
import { TimezoneService } from 'src/timezone/timezone.service';
import { KDto } from './dto/k-dto';
import { KDJDto } from './dto/kdj-dto';
import { MACDDto } from './dto/macd-dto';
import { RSIDto } from './dto/rsi-dto';
import { RunKDJDto } from './dto/run-kdj-dto';
import { IndicatorService } from './indicator.service';
import { KVo } from './vo/k-vo';
import { KDJVo } from './vo/kdj-vo';
import { MACDVo } from './vo/macd-vo';
import { RSIVo } from './vo/rsi-vo';

@Controller('indicator')
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Inject()
  private dataService: DataService;

  @Inject()
  private timezoneService: TimezoneService;

  @Post('macd')
  async macd(@Body() MACDDto: MACDDto): Promise<MACDVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      MACDDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(MACDDto.endDate);
    let data = [] as IndexVo[];
    if (MACDDto.daily) {
      data = await this.dataService.findIndexDailyPriceById({
        symbol: MACDDto.symbol,
        startDate,
        endDate,
      });
    }
    if (MACDDto.period) {
      data = await this.dataService.findIndexPeriodPriceById({
        symbol: MACDDto.symbol,
        period: MACDDto.period,
        startDate,
        endDate,
      });
    }
    const macdResult = await this.indicatorService.runMACD(
      data.map((item) => item.amount),
    );

    return data.map((item, index) => ({
      macd: macdResult.macd[index],
      signal: macdResult.signal[index],
      histogram: macdResult.histogram[index],
      symbol: item.symbol,
      time: item.time,
      amount: item.amount,
    }));
  }

  @Post('kdj')
  async kdj(@Body() KDJDto: KDJDto): Promise<KDJVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      KDJDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(KDJDto.endDate);

    let data = [] as IndexVo[];

    if (KDJDto.daily) {
      data = await this.dataService.findIndexDailyPriceById({
        symbol: KDJDto.symbol,
        startDate,
        endDate,
      });
    }
    if (KDJDto.period) {
      data = await this.dataService.findIndexPeriodPriceById({
        symbol: KDJDto.symbol,
        period: KDJDto.period,
        startDate,
        endDate,
      });
    }
    const KDJParams = data.reduce<RunKDJDto>(
      (prev, cur) => {
        prev.high.push(cur.highest);
        prev.low.push(cur.lowest);
        prev.close.push(cur.close);
        return prev;
      },
      {
        high: [],
        low: [],
        close: [],
      },
    );
    const kdjResult = await this.indicatorService.runKDJ(KDJParams);

    return data.map((item, index) => ({
      k: kdjResult.K[index],
      d: kdjResult.D[index],
      j: kdjResult.J[index],
      symbol: item.symbol,
      time: item.time,
      amount: item.amount,
    }));
  }

  @Post('rsi')
  async rsi(@Body() RSIDto: RSIDto): Promise<RSIVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      RSIDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(RSIDto.endDate);

    let data = [] as IndexVo[];

    if (RSIDto.daily) {
      data = await this.dataService.findIndexDailyPriceById({
        symbol: RSIDto.symbol,
        startDate,
        endDate,
      });
    }
    if (RSIDto.period) {
      data = await this.dataService.findIndexPeriodPriceById({
        symbol: RSIDto.symbol,
        period: RSIDto.period,
        startDate,
        endDate,
      });
    }
    const rsiResult = await this.indicatorService.runRSI(
      data.map((item) => item.amount),
    );

    return data.map((item, index) => ({
      rsi: rsiResult[index],
      symbol: item.symbol,
      time: item.time,
      amount: item.amount,
    }));
  }

  @Post('k')
  async k(@Body() KDto: KDto): Promise<KVo[]> {
    const startDate = this.timezoneService.convertTimestamp2Date(
      KDto.startDate,
    );
    const endDate = this.timezoneService.convertTimestamp2Date(KDto.endDate);

    let data = [] as IndexVo[];

    if (KDto.daily) {
      data = await this.dataService.findIndexDailyPriceById({
        symbol: KDto.symbol,
        startDate,
        endDate,
      });
    }
    if (KDto.period) {
      data = await this.dataService.findIndexPeriodPriceById({
        symbol: KDto.symbol,
        period: KDto.period,
        startDate,
        endDate,
      });
    }

    return data.map((item) => ({
      highest: item.highest,
      lowest: item.lowest,
      open: item.open,
      close: item.close,
      symbol: item.symbol,
      time: item.time,
      amount: item.amount,
    }));
  }
}
