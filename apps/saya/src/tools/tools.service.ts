import { ERROR_MESSAGES } from '@app/constants/errors';
import { UtilsService } from '@app/utils';
import { tool } from '@langchain/core/tools';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { IndicatorQueryDto } from '../../../mist/src/indicator/dto/query/indicator-query.dto';
import { KVo } from '../../../mist/src/indicator/vo/k.vo';
import { KDJVo } from '../../../mist/src/indicator/vo/kdj.vo';
import { MACDVo } from '../../../mist/src/indicator/vo/macd.vo';
import { RSIVo } from '../../../mist/src/indicator/vo/rsi.vo';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { LocalServiceDto } from './dto/local-service.dto';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger();

  constructor(
    private readonly httpService: HttpService,
    private readonly utilsService: UtilsService,
  ) {}

  // 封装mist中indicator的接口，形成tools
  private async getLocalService<T, U>(
    localServiceDto: LocalServiceDto<T>,
  ): Promise<U> {
    const { data } = await firstValueFrom(
      this.httpService
        .get<U>(localServiceDto.url, {
          params: localServiceDto.params,
        })
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error, ToolsService);
            throw new HttpException(
              `${ERROR_MESSAGES.LOCAL_SERVICE_REQUEST_FAILED}: ${localServiceDto.url}`,
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    return data;
  }

  createGetKTool() {
    return tool(
      async (params: IndicatorQueryDto) => {
        const ks = this.getLocalService<IndicatorQueryDto, KVo[]>({
          url: this.utilsService.getLocalUrl('k'),
          params,
        });
        return this.utilsService.formatLocalResult(ks);
      },
      {
        name: 'get_k_tool',
        description:
          '根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的k线数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(13位数字类型)、endDate(13位数字类型) 的对象。',
      },
    );
  }

  createGetKDJTool() {
    return tool(
      async (params: IndicatorQueryDto) => {
        const kdjs = this.getLocalService<IndicatorQueryDto, KDJVo[]>({
          url: this.utilsService.getLocalUrl('kdj'),
          params,
        });
        return this.utilsService.formatLocalResult(kdjs);
      },
      {
        name: 'get_kdj_tool',
        description:
          '根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的kdj数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(13位数字类型)、endDate(13位数字类型) 的对象。',
      },
    );
  }

  createGetMACDTool() {
    return tool(
      async (params: IndicatorQueryDto) => {
        const macds = this.getLocalService<IndicatorQueryDto, MACDVo[]>({
          url: this.utilsService.getLocalUrl('macd'),
          params,
        });
        return this.utilsService.formatLocalResult(macds);
      },
      {
        name: 'get_macd_tool',
        description:
          '根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的macd数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(13位数字类型)、endDate(13位数字类型) 的对象。',
      },
    );
  }

  createGetRSITool() {
    return tool(
      async (params: IndicatorQueryDto) => {
        const rsis = this.getLocalService<IndicatorQueryDto, RSIVo[]>({
          url: this.utilsService.getLocalUrl('rsi'),
          params,
        });
        return this.utilsService.formatLocalResult(rsis);
      },
      {
        name: 'get_rsi_tool',
        description:
          '根据提供的 symbol、code、startDate、endDate 从本地系统获取股票的rsi数据。输入必须是包含 symbol (字符串类型)、code (字符串类型)、startDate(13位数字类型)、endDate(13位数字类型) 的对象。',
      },
    );
  }
}
