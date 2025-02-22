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
import { addMinutes, format, parse } from 'date-fns';
import { catchError, firstValueFrom } from 'rxjs';
import { TimezoneService } from 'src/timezone/timezone.service';
import { getNowDate } from 'src/utils';
import { Between, Repository } from 'typeorm';
import { CronIndexDailyDto } from './dto/cron-index-daily.dto';
import { CronIndexPeriodDto } from './dto/cron-index-period.dto';
import { IndexDailyDto } from './dto/index-daily.dto';
import { IndexPeriodDto } from './dto/index-period.dto';
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
import { IndexVo } from './vo/index-vo';

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
    const indexData =
      (await this.indexDataRepository.findOne({
        where: { symbol: '000001' },
      })) || new IndexData();
    indexData.symbol = '000001';
    indexData.type = IndexDataType.LARGE;
    indexData.code = 'sh';
    indexData.name = '上证指数';
    await this.indexDataRepository.save(indexData);

    const indexData2 =
      (await this.indexDataRepository.findOne({
        where: { symbol: '000300' },
      })) || new IndexData();
    indexData2.symbol = '000300';
    indexData2.type = IndexDataType.LARGE;
    indexData2.code = 'sh';
    indexData2.name = '沪深300';
    await this.indexDataRepository.save(indexData2);
  }

  async index() {
    return await this.indexDataRepository.find();
  }

  private async getIndexPeriod(
    index: IndexPeriodDto,
  ): Promise<IndexPeriodVo[]> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<IndexPeriodVo[]>(
          'http://127.0.0.1:8080/api/public/index_zh_a_hist_min_em',
          {
            params: {
              symbol: index.symbol,
              period: index.period,
              start_date: format(index.startDate, 'yyyy-MM-dd HH:mm:ss'),
              end_date: format(index.endDate, 'yyyy-MM-dd HH:mm:ss'),
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

  private async saveIndexPeriod(
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
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
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

  private build1MinData(timeEnd: Date, data: IndexPeriodVo[]): IndexPeriodVo {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();
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

  private build5MinData(timeEnd: Date, data: IndexPeriodVo[]): IndexPeriodVo {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();
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

  private build15MinData(timeEnd: Date, data: IndexPeriodVo[]): IndexPeriodVo {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();
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

  private build30MinData(timeEnd: Date, data: IndexPeriodVo[]): IndexPeriodVo {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();
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

  private build60MinData(timeEnd: Date, data: IndexPeriodVo[]): IndexPeriodVo {
    const hours = timeEnd.getHours();
    const minutes = timeEnd.getMinutes();
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
      startDate: timeStart,
      endDate: timeEnd,
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
    console.log(
      'responseVo, timeStart, timeEnd, data, cronIndexDto.periodType',
      responseVo,
      timeStart,
      timeEnd,
      data,
      cronIndexDto.periodType,
    );
    if (!responseVo) {
      throw new HttpException('构建保存数据错误', HttpStatus.BAD_REQUEST);
    }
    const result = await this.saveIndexPeriod(
      {
        symbol: cronIndexDto.symbol,
        time: timeEnd,
      },
      responseVo,
      cronIndexDto.periodType,
    );
    this.logger.debug(
      `cronIndexPeriod - 周期: ${cronIndexDto.periodType} - ${result} - 启动时间：${format(timeStart, 'yyyy-MM-dd HH:mm:ss')} - 结束时间：${format(timeEnd, 'yyyy-MM-dd HH:mm:ss')}`,
      DataService,
    );
    return result;
  }

  private async getIndexDaily(index: IndexDailyDto): Promise<IndexDailyVo[]> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<IndexDailyVo[]>(
          'http://127.0.0.1:8080/api/public/stock_zh_index_daily_em',
          {
            params: {
              symbol: `${index.code}${index.symbol}`,
              start_date: format(index.startDate, 'yyyyMMdd'),
              end_date: format(index.endDate, 'yyyyMMdd'),
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

  private async saveIndexDaily(symbol: string, data: IndexDailyVo) {
    // 首先按照时间找到对应的字段和类型
    const foundIndex = await this.indexDataRepository.findOneBy({ symbol });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const foundIndexDailyTime = parse(data.date, 'yyyy-MM-dd', getNowDate());
    // 按照指数id、时间戳查找到对应的id
    const foundIndexDaily = await this.indexDailyRepository.findOne({
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
        time: foundIndexDailyTime,
      },
    });
    // // 如果找不到, 说明是新增, 并且理论上只需要保留第一位即可
    const indexDaily = foundIndexDaily || new IndexDaily();
    indexDaily.time = foundIndexDailyTime;
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
  private async saveIndeDailyBatch(symbol: string, data: IndexDailyVo[]) {
    // 首先按照时间找到对应的字段和类型
    const foundIndex = await this.indexDataRepository.findOneBy({ symbol });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const batchData = await Promise.all(
      data.map(async (item) => {
        const foundIndexDailyTime = parse(
          item.date,
          'yyyy-MM-dd',
          getNowDate(),
        );
        const foundIndexDaily = await this.indexDailyRepository.findOne({
          relations: ['indexData'],
          where: {
            indexData: {
              id: foundIndex.id,
              symbol: foundIndex.symbol,
            },
            time: foundIndexDailyTime,
          },
        });
        const indexDaily = foundIndexDaily || new IndexDaily();
        indexDaily.time = foundIndexDailyTime;
        indexDaily.open = item.open;
        indexDaily.close = item.close;
        indexDaily.highest = item.high;
        indexDaily.lowest = item.low;
        indexDaily.volume = item.volume.toString();
        indexDaily.amount = item.amount;
        indexDaily.indexData = foundIndex;
        return indexDaily;
      }),
    );
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
      startDate: timeStart,
      endDate: timeEnd,
    });
    let result = '';
    if (data.length > 1) {
      result = await this.saveIndeDailyBatch(cronIndexDto.symbol, data);
    } else if (data.length === 1) {
      result = await this.saveIndexDaily(cronIndexDto.symbol, data[0]);
    } else {
      result = '数据不存在';
    }
    this.logger.debug(
      `cronIndexDaily - 日期 - ${result} - 启动时间：${format(timeStart, 'yyyy-MM-dd HH:mm:ss')} - 结束时间：${format(timeEnd, 'yyyy-MM-dd HH:mm:ss')}`,
      DataService,
    );
    return result;
  }

  async findIndexPeriodById(
    indexPeriodDto: IndexPeriodDto,
  ): Promise<IndexVo[]> {
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: indexPeriodDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const foundPeriod = await this.indexPeriodRepository.find({
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
        type: indexPeriodDto.period,
        time: Between(indexPeriodDto.startDate, indexPeriodDto.endDate),
      },
      order: {
        time: 'ASC',
      },
    });
    return foundPeriod.map((item) => ({
      symbol: item.indexData.symbol,
      ...item,
    }));
  }

  async findIndexDailyById(indexDailyDto: IndexDailyDto): Promise<IndexVo[]> {
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: indexDailyDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const foundDaily = await this.indexDailyRepository.find({
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
        time: Between(indexDailyDto.startDate, indexDailyDto.endDate),
      },
      order: {
        time: 'ASC',
      },
    });
    return foundDaily.map((item) => ({
      symbol: item.indexData.symbol,
      ...item,
    }));
  }
}
