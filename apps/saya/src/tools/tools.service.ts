import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { tool } from '@langchain/core/tools';
import { catchError, firstValueFrom } from 'rxjs';
import { Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { LocalServiceDto } from './dto/local-service.dto';
import { AxiosError } from 'axios';
import { KDto } from 'apps/mist/src/indicator/dto/k.dto';
import { KVo } from 'apps/mist/src/indicator/vo/k.vo';
import { UtilsService } from '@app/utils';

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
        description: '',
      },
    );
  }
}
