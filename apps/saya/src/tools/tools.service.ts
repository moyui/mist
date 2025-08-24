import { UtilsService } from '@app/utils';
import { tool } from '@langchain/core/tools';
import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { KDto } from 'apps/mist/src/indicator/dto/k.dto';
import { KDJDto } from 'apps/mist/src/indicator/dto/kdj.dto';
import { MACDDto } from 'apps/mist/src/indicator/dto/macd.dto';
import { RSIDto } from 'apps/mist/src/indicator/dto/rsi.dto';
import { KVo } from 'apps/mist/src/indicator/vo/k.vo';
import { KDJVo } from 'apps/mist/src/indicator/vo/kdj.vo';
import { MACDVo } from 'apps/mist/src/indicator/vo/macd.vo';
import { RSIVo } from 'apps/mist/src/indicator/vo/rsi.vo';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { LocalServiceDto } from './dto/local-service.dto';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger();

  @Inject()
  private httpService: HttpService;

  @Inject()
  private utilsService: UtilsService;

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
              `请求本地数据：${localServiceDto.url}出错`,
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }),
        ),
    );
    return data;
  }

  createGetKTool() {
    return tool(
      async (params: KDto) => {
        const ks = this.getLocalService<KDto, KVo[]>({
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
      async (params: KDJDto) => {
        const kdjs = this.getLocalService<KDJDto, KDJVo[]>({
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
      async (params: MACDDto) => {
        const macds = this.getLocalService<MACDDto, MACDVo[]>({
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
      async (params: RSIDto) => {
        const rsis = this.getLocalService<RSIDto, RSIVo[]>({
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
