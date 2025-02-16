import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import { addMinutes } from 'date-fns';
import { catchError, firstValueFrom } from 'rxjs';
import { TimezoneService } from 'src/timezone/timezone.service';
import { ConvertTimezoneVo } from 'src/timezone/vo/convert-timezone.vo';
import { Repository } from 'typeorm';
import { CronIndexPeriodDto } from './dto/cron-index-period.dto';
import { CronIndexDailyDto } from './dto/cron-index-daily.dto';
import { GetIndexDailyDto } from './dto/get-index-daily.dto';
import { GetIndexPeriodDto } from './dto/get-index-period.dto';
import { SaveIndexDailyDto } from './dto/save-index-daily.dto';
import { SaveIndexPeriodDto } from './dto/save-index-period.dto';
import { IndexDaily } from './entities/index-daily.entity';
import {
  IndexData,
  Type as IndexDataType,
} from './entities/index-data.entitiy';
import {
  IndexPeriod,
  Type as IndexPeriodType,
} from './entities/index-period.entity';
import { IndexDailyVo } from './vo/index-daily-vo';
import { IndexPeriodVo } from './vo/index-period-vo';

@Injectable()
export class DataService {
  private readonly logger = new Logger();

  @Inject()
  private httpService: HttpService;

  @Inject()
  private timezoneService: TimezoneService;

  @InjectRepository(IndexData)
  private indexDataRepository: Repository<IndexData>;

  @InjectRepository(IndexPeriod)
  private indexPeriodRepository: Repository<IndexPeriod>;

  @InjectRepository(IndexDaily)
  private indexDailyRepository: Repository<IndexDaily>;

  async initData() {
    const indexData = new IndexData();
    indexData.symbol = '000001';
    indexData.type = IndexDataType.LARGE;
    indexData.code = 'sh';
    indexData.name = '上证指数';
    await this.indexDataRepository.save(indexData);

    const indexData2 = new IndexData();
    indexData2.symbol = '000300';
    indexData2.type = IndexDataType.LARGE;
    indexData2.code = 'sh';
    indexData2.name = '沪深300';
    await this.indexDataRepository.save(indexData2);
  }

  async getIndexPeriod(index: GetIndexPeriodDto): Promise<IndexPeriodVo[]> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<IndexPeriodVo[]>(
          'http://127.0.0.1:8080/api/public/index_zh_a_hist_min_em',
          {
            params: {
              symbol: index.symbol,
              period: index.period,
              start_date: index.startDate,
              end_date: index.endDate,
            },
          },
        )
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data, DataService);
            throw new HttpException(
              '请求指数周期数据错误',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    return data;
  }

  async saveIndexPeriod(
    saveIndexDto: SaveIndexPeriodDto,
    data: IndexPeriodVo,
    type: IndexPeriodType,
  ) {
    // 首先按照时间找到对应的字段和类型
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: saveIndexDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    // 按照指数id、时间戳、类型查找到对应的id
    const foundIndexPeriod = await this.indexPeriodRepository.findOne({
      where: {
        indexData: foundIndex,
        time: saveIndexDto.time,
        type,
      },
    });
    // 如果找不到, 说明是新增, 并且理论上只需要保留第一位即可
    const indexPeriod = foundIndexPeriod || new IndexPeriod();
    indexPeriod.time = saveIndexDto.time;
    indexPeriod.open = data['开盘'];
    indexPeriod.close = data['收盘'];
    indexPeriod.highest = data['最高'];
    indexPeriod.lowest = data['最低'];
    indexPeriod.volume = data['成交量'].toString();
    indexPeriod.amount = data['成交额'];
    // indexPeriod.vibration = data[0]['振幅'];
    // indexPeriod.turnover_rate = data[0]['换手率'];
    indexPeriod.type = type;
    indexPeriod.indexData = foundIndex;
    try {
      await this.indexPeriodRepository.save(indexPeriod);
      return '指数周期数据保存成功';
    } catch (e) {
      this.logger.error(e, DataService);
      return '指数周期数据保存失败';
    }
  }

  private build1MinData(
    timeEnd: ConvertTimezoneVo,
    data: IndexPeriodVo[],
  ): IndexPeriodVo {
    const hours = timeEnd.date.getHours();
    const minutes = timeEnd.date.getMinutes();
    // 早上开盘
    if (hours === 9 && minutes === 31) {
      // 如果是获取9点30到9点31的，则合并
      const responseVo = {
        时间: data[1]['时间'],
        开盘: data[0]['开盘'],
        收盘: data[1]['收盘'],
        最高: Math.max(data[0]['最高'], data[1]['最高']),
        最低: Math.max(data[0]['最低'], data[1]['最低']),
        成交量: data[0]['成交量'] + data[1]['成交量'],
        成交额: data[0]['成交额'] + data[1]['成交额'],
      };
      return responseVo;
      // 中午开盘
    } else if (hours === 13 && minutes === 1) {
      return data[0];
      //其他时间
    } else {
      return data[1];
    }
  }

  private build5MinData(
    timeEnd: ConvertTimezoneVo,
    data: IndexPeriodVo[],
  ): IndexPeriodVo {
    const hours = timeEnd.date.getHours();
    const minutes = timeEnd.date.getMinutes();
    // 早上开盘
    if (hours === 9 && minutes === 35) {
      return data[0];
      // 中午开盘
    } else if (hours === 13 && minutes === 5) {
      return data[0];
    } else {
      //其他时间
      return data[1];
    }
  }

  private build15MinData(
    timeEnd: ConvertTimezoneVo,
    data: IndexPeriodVo[],
  ): IndexPeriodVo {
    const hours = timeEnd.date.getHours();
    const minutes = timeEnd.date.getMinutes();
    // 早上开盘
    if (hours === 9 && minutes === 45) {
      return data[0];
      // 中午开盘
    } else if (hours === 13 && minutes === 15) {
      return data[0];
    } else {
      //其他时间
      return data[1];
    }
  }

  private build30MinData(
    timeEnd: ConvertTimezoneVo,
    data: IndexPeriodVo[],
  ): IndexPeriodVo {
    const hours = timeEnd.date.getHours();
    const minutes = timeEnd.date.getMinutes();
    // 早上开盘
    if (hours === 10 && minutes === 0) {
      return data[0];
      // 中午开盘
    } else if (hours === 13 && minutes === 30) {
      return data[0];
    } else {
      //其他时间
      return data[1];
    }
  }

  private build60MinData(
    timeEnd: ConvertTimezoneVo,
    data: IndexPeriodVo[],
  ): IndexPeriodVo {
    const hours = timeEnd.date.getHours();
    const minutes = timeEnd.date.getMinutes();
    // 早上开盘
    if (hours === 10 && minutes === 30) {
      return data[0];
      // 中午开盘
    } else if (hours === 14 && minutes === 0) {
      return data[0];
    } else {
      //其他时间
      return data[1];
    }
  }

  async cronIndexPeriod(cronIndexDto: CronIndexPeriodDto) {
    const timeStart = this.timezoneService.convertToBeijingTimeWithInterval(
      addMinutes(cronIndexDto.time, -1 - cronIndexDto.periodType),
      'Asia/Shanghai', // from时间
      1,
    ); // 前2分钟
    const timeEnd = this.timezoneService.convertToBeijingTimeWithInterval(
      addMinutes(cronIndexDto.time, -1),
      'Asia/Shanghai', // from时间
      1,
    ); // 前1分钟
    const data = await this.getIndexPeriod({
      symbol: cronIndexDto.symbol,
      period: cronIndexDto.periodType,
      startDate: timeStart.format,
      endDate: timeEnd.format,
    });
    let responseVo: IndexPeriodVo | null = null;
    switch (cronIndexDto.periodType) {
      case IndexPeriodType.One:
        responseVo = this.build1MinData(timeEnd, data);
        break;
      case IndexPeriodType.FIVE:
        responseVo = this.build5MinData(timeEnd, data);
        break;
      case IndexPeriodType.FIFTEEN:
        responseVo = this.build15MinData(timeEnd, data);
        break;
      case IndexPeriodType.THIRTY:
        responseVo = this.build30MinData(timeEnd, data);
        break;
      case IndexPeriodType.SIXTY:
        responseVo = this.build60MinData(timeEnd, data);
        break;
      default:
        responseVo = null;
    }
    if (!responseVo) {
      throw new HttpException('构建保存数据错误', HttpStatus.BAD_REQUEST);
    }
    const result = await this.saveIndexPeriod(
      {
        symbol: cronIndexDto.symbol,
        time: timeEnd.format,
      },
      responseVo,
      cronIndexDto.periodType,
    );
    this.logger.debug(
      `cronIndexPeriod ${result} - 启动时间：${timeStart.format} - 结束时间：${timeEnd.format}`,
      DataService,
    );
    return result;
  }

  async getIndexDaily(index: GetIndexDailyDto): Promise<IndexDailyVo[]> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<IndexDailyVo[]>(
          'http://127.0.0.1:8080/api/public/stock_zh_index_daily_em',
          {
            params: {
              symbol: `${index.code}${index.symbol}`,
              start_date: index.startDate,
              end_date: index.endDate,
            },
          },
        )
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data, DataService);
            throw new HttpException(
              '请求指数日期数据错误',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    return data;
  }

  async saveIndexDaily(saveIndexDto: SaveIndexDailyDto, data: IndexDailyVo) {
    // 首先按照时间找到对应的字段和类型
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: saveIndexDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    // 按照指数id、时间戳查找到对应的id
    const foundIndexDaily = await this.indexDailyRepository.findOne({
      where: {
        indexData: foundIndex,
        time: saveIndexDto.time,
      },
    });
    // // 如果找不到, 说明是新增, 并且理论上只需要保留第一位即可
    const indexDaily = foundIndexDaily || new IndexDaily();
    indexDaily.time = data.date;
    indexDaily.open = data.open;
    indexDaily.close = data.close;
    indexDaily.highest = data.high;
    indexDaily.lowest = data.low;
    indexDaily.volume = data.volume.toString();
    indexDaily.amount = data.amount;
    indexDaily.indexData = foundIndex;
    try {
      await this.indexDailyRepository.save(indexDaily);
      return '指数日期数据保存成功';
    } catch (e) {
      this.logger.error(e, DataService);
      return '指数日期数据保存失败';
    }
  }

  // 批量保存的部分默认全部是新加入，数据清洗之后再说
  async saveIndeDailyBatch(
    saveIndexDto: SaveIndexDailyDto,
    data: IndexDailyVo[],
  ) {
    // 首先按照时间找到对应的字段和类型
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: saveIndexDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const batchData = data.map((item) => {
      const indexDaily = new IndexDaily();
      indexDaily.time = item.date;
      indexDaily.open = item.open;
      indexDaily.close = item.close;
      indexDaily.highest = item.high;
      indexDaily.lowest = item.low;
      indexDaily.volume = item.volume.toString();
      indexDaily.amount = item.amount;
      indexDaily.indexData = foundIndex;
      return indexDaily;
    });
    try {
      await this.indexDailyRepository.save(batchData);
      return '指数日期数据批量保存成功';
    } catch (e) {
      this.logger.error(e, DataService);
      return '指数日期数据批量保存失败';
    }
  }

  // 这个理论上是需要每天跑一次的，可以选择2种模式
  // 如果查询当前日期，就开始日期等于结束日期
  async cronIndexDaily(cronIndexDto: CronIndexDailyDto, all: boolean) {
    const timeStart = this.timezoneService.convertToBeijingTimeInDaily(
      all ? new Date('1990-01-01') : cronIndexDto.startDate,
      'Asia/Shanghai',
    );
    const timeEnd = this.timezoneService.convertToBeijingTimeInDaily(
      all ? new Date() : cronIndexDto.endDate,
      'Asia/Shanghai',
    );
    const data = await this.getIndexDaily({
      symbol: cronIndexDto.symbol,
      code: cronIndexDto.code,
      startDate: timeStart.format,
      endDate: timeEnd.format,
    });
    let result = '';
    if (data.length > 1) {
      result = await this.saveIndeDailyBatch(
        {
          symbol: cronIndexDto.symbol,
          time: timeEnd.format, // 这个日期入参是无效的，后续代码不会使用，只是为了保持格式一致
        },
        data,
      );
    } else {
      result = await this.saveIndexDaily(
        {
          symbol: cronIndexDto.symbol,
          time: data[0]?.date,
        },
        data[0],
      );
    }
    this.logger.debug(
      `cronIndexDaily ${result} - 启动时间：${timeStart.format} - 结束时间：${timeEnd.format}`,
      DataService,
    );
    return result;
  }
}
