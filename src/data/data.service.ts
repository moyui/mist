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
import {
  IndexData,
  Type as IndexDataType,
} from './entities/index-data.entitiy';
import { IndexPeriod } from './entities/index-period.entity';
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
}
