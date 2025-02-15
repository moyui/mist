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
import { catchError, firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { GetIndexDto } from './dto/get-index.dto';
import { SaveIndexDto } from './dto/save-index.dto';
import {
  IndexData,
  Type as IndexDataType,
} from './entities/index-data.entitiy';
import {
  IndexPeriod,
  Type as IndexPeriodType,
} from './entities/index-period.entity';
import { IndexResponse } from './entities/index-response.entity';

@Injectable()
export class DataService {
  private readonly logger = new Logger();

  @Inject()
  private httpService: HttpService;

  @InjectRepository(IndexData)
  private indexDataRepository: Repository<IndexData>;

  @InjectRepository(IndexPeriod)
  private indexPeriodRepository: Repository<IndexPeriod>;

  async initData() {
    const indexData = new IndexData();
    indexData.symbol = '000001';
    indexData.type = IndexDataType.LARGE;
    indexData.name = '上证指数';
    await this.indexDataRepository.save(indexData);

    const indexData2 = new IndexData();
    indexData2.symbol = '000300';
    indexData2.type = IndexDataType.LARGE;
    indexData2.name = '沪深300';
    await this.indexDataRepository.save(indexData2);
  }

  async getIndex(index: GetIndexDto): Promise<IndexResponse[]> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<IndexResponse[]>(
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
              '请求指数数据错误',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    return data;
  }

  async saveData(
    saveIndexDto: SaveIndexDto,
    data: IndexResponse,
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
    indexPeriod.price = data['成交额'];
    // indexPeriod.vibration = data[0]['振幅'];
    // indexPeriod.turnover_rate = data[0]['换手率'];
    indexPeriod.type = type;
    indexPeriod.indexData = foundIndex;
    try {
      await this.indexPeriodRepository.save(indexPeriod);
      return '数据保存成功';
    } catch (e) {
      this.logger.error(e, DataService);
      return '数据保存失败';
    }
  }
}
