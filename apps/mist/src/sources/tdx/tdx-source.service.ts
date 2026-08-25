import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import {
  DataSource,
  Period,
  K,
  KExtensionTdx,
  Security,
} from '@app/shared-data';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';
import { ITdxSourceFetcher } from './tdx-source-fetcher.interface';
import {
  TdxResponse,
  TdxExtension,
  TdxEnvelope,
  TdxBarsResponseData,
  TdxNormalizedBar,
  TdxDividendFactorsResponseData,
  TdxDividendFactorItem,
} from './types';
import { DATASOURCE_HTTP_TIMEOUT_MS } from '../constants';
import { saveBaseK } from '../k-save.helper';

const TDX_BAR_FIELDS = [
  'Open',
  'High',
  'Low',
  'Close',
  'Volume',
  'Amount',
  'ForwardFactor',
  'VolInStock',
];

const MARKET_TIME_ZONE = ASIA_SHANGHAI_TIMEZONE;

// TypeORM .orUpdate() expects DATABASE column names, not entity property names.
// These match the @Column name: values in KExtensionTdx.
const TDX_EXTENSION_UPSERT_COLUMNS = [
  'forward_factor',
  'vol_in_stock',
  'backward_factor',
  'volume_ratio',
  'turnover_rate',
  'turnover_amount',
  'total_market_value',
  'float_market_value',
  'earnings_per_share',
  'price_earnings_ratio',
  'price_to_book_ratio',
];

@Injectable()
export class TdxSource implements ITdxSourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(TdxSource.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.baseUrl =
      this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: this.baseUrl,
      timeout: DATASOURCE_HTTP_TIMEOUT_MS,
    });
  }

  async fetchK(params: {
    code: string;
    formatCode: string;
    period: Period;
    startDate: Date;
    endDate: Date;
  }): Promise<TdxResponse[]> {
    const { formatCode, period, startDate, endDate } = params;

    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.TDX,
    );
    if (!periodFormat) {
      throw new HttpException(
        `Period ${period} not supported by TDX`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await this.axios.post<TdxEnvelope<TdxBarsResponseData>>(
        '/v1/bars/query',
        {
          symbols: [formatCode],
          period: periodFormat,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          fields: TDX_BAR_FIELDS,
          dividendType: 'front',
          fillData: true,
        },
      );
      const envelope = response.data;

      if (!envelope?.ok) {
        this.throwEnvelopeError(envelope, 'TDX bars query failed');
      }
      if (!Array.isArray(envelope.data?.bars)) {
        throw new HttpException(
          'Invalid normalized TDX bars response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return envelope.data.bars.map((bar) => {
        const extensions = this.extractBarExtensions(bar);
        return {
          timestamp: parseISO(bar.barTime),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: normalizeTdxBarQuantity(bar.volume, 'volume'),
          amount: normalizeTdxBarQuantity(bar.amount, 'amount'),
          ...(extensions ? { extensions } : {}),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX data: ${errorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
        { cause: error },
      );
    }
  }

  async fetchDividFactors(
    formatCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    { timestamp: Date; forwardFactor: number; backwardFactor: number }[]
  > {
    try {
      const response = await this.axios.post<
        TdxEnvelope<TdxDividendFactorsResponseData>
      >('/v1/reference/dividend-factors/query', {
        symbol: formatCode,
        startTime: formatInTimeZone(startDate, MARKET_TIME_ZONE, 'yyyyMMdd'),
        endTime: formatInTimeZone(endDate, MARKET_TIME_ZONE, 'yyyyMMdd'),
      });
      const envelope = response.data;

      if (!envelope?.ok || !Array.isArray(envelope.data?.items)) {
        return [];
      }

      return envelope.data.items.flatMap((item) => {
        const mapped = this.mapDividendFactorItem(item);
        return mapped ? [mapped] : [];
      });
    } catch (error) {
      this.logger.warn(
        `Recoverable TDX fetchDividFactors error; continuing without dividend factors: ${error.message}`,
      );
      return [];
    }
  }

  private mapDividendFactorItem(
    item: TdxDividendFactorItem,
  ): { timestamp: Date; forwardFactor: number; backwardFactor: number } | null {
    if (
      item.forwardFactor == null ||
      item.backwardFactor == null ||
      !item.date
    ) {
      return null;
    }

    return {
      timestamp: this.parseDividendDate(item.date),
      forwardFactor: item.forwardFactor,
      backwardFactor: item.backwardFactor,
    };
  }

  private parseDividendDate(date: string): Date {
    const normalizedDate = this.normalizeDividendDate(date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return parseISO(`${normalizedDate}T00:00:00+08:00`);
    }
    return parseISO(normalizedDate);
  }

  private normalizeDividendDate(date: string): string {
    if (/^\d{8}$/.test(date)) {
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    }
    return date;
  }

  async saveK(
    data: TdxResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      const savedKByTimestamp = await saveBaseK(
        manager,
        data,
        security,
        DataSource.TDX,
        period,
      );

      const extensions = data
        .map((d) => {
          const k = savedKByTimestamp.get(d.timestamp.getTime());
          if (!k) return null;

          return manager.create(KExtensionTdx, {
            ...this.buildExtensionPayload(k, d.extensions),
            kId: k.id,
          });
        })
        .filter((extension): extension is KExtensionTdx => extension != null);

      if (extensions.length > 0) {
        const extensionValues = extensions.map((extension) => ({
          kId: extension.kId,
          forwardFactor: extension.forwardFactor,
          volInStock: extension.volInStock,
          backwardFactor: extension.backwardFactor,
          volumeRatio: extension.volumeRatio,
          turnoverRate: extension.turnoverRate,
          turnoverAmount: extension.turnoverAmount,
          totalMarketValue: extension.totalMarketValue,
          floatMarketValue: extension.floatMarketValue,
          earningsPerShare: extension.earningsPerShare,
          priceEarningsRatio: extension.priceEarningsRatio,
          priceToBookRatio: extension.priceToBookRatio,
        }));

        await manager
          .createQueryBuilder()
          .insert()
          .into(KExtensionTdx)
          .values(extensionValues)
          .orUpdate(TDX_EXTENSION_UPSERT_COLUMNS, ['k_id'])
          .updateEntity(false)
          .execute();
      }
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.TDX);
  }

  private throwEnvelopeError(
    envelope: TdxEnvelope<unknown> | undefined,
    fallbackMessage: string,
  ): never {
    const code = envelope?.error?.code || 'TDX_HTTP_ERROR';
    const message = envelope?.error?.message || fallbackMessage;
    throw new HttpException(`${code}: ${message}`, HttpStatus.BAD_GATEWAY);
  }

  private extractBarExtensions(
    bar: TdxNormalizedBar,
  ): TdxExtension | undefined {
    const extension: TdxExtension = {};
    if (bar.forwardFactor != null) {
      extension.forwardFactor = bar.forwardFactor;
    }
    if (bar.volInStock != null) {
      extension.volInStock = bar.volInStock;
    }
    return Object.keys(extension).length > 0 ? extension : undefined;
  }

  private buildExtensionPayload(
    k: K,
    ext: TdxExtension | undefined,
  ): Partial<KExtensionTdx> {
    const payload: Partial<KExtensionTdx> = {
      k,
    };

    if (ext?.forwardFactor != null) {
      payload.forwardFactor = ext.forwardFactor;
    }
    if (ext?.volInStock != null) {
      payload.volInStock = ext.volInStock;
    }
    if (ext?.backwardFactor != null) {
      payload.backwardFactor = ext.backwardFactor;
    }
    if (ext?.volumeRatio != null) {
      payload.volumeRatio = ext.volumeRatio;
    }
    if (ext?.turnoverRate != null) {
      payload.turnoverRate = ext.turnoverRate;
    }
    if (ext?.turnoverAmount != null) {
      payload.turnoverAmount = ext.turnoverAmount;
    }
    if (ext?.totalMarketValue != null) {
      payload.totalMarketValue = ext.totalMarketValue;
    }
    if (ext?.floatMarketValue != null) {
      payload.floatMarketValue = ext.floatMarketValue;
    }
    if (ext?.earningsPerShare != null) {
      payload.earningsPerShare = ext.earningsPerShare;
    }
    if (ext?.priceEarningsRatio != null) {
      payload.priceEarningsRatio = ext.priceEarningsRatio;
    }
    if (ext?.priceToBookRatio != null) {
      payload.priceToBookRatio = ext.priceToBookRatio;
    }

    return payload;
  }
}

function normalizeTdxBarQuantity(
  value: string | null,
  fieldName: 'volume' | 'amount',
): string | null {
  if (value === null) return null;
  const normalized = normalizeExternalDecimalText(value);
  if (fieldName === 'amount') {
    // TDX historical amount is provider-native 万元; canonical is yuan.
    // Exact fixed-point ×10000 (Decimal8), no binary-float arithmetic.
    return Decimal8.parseCanonical(normalized)
      .scaleByUnit(10_000)
      .formatCanonical();
  }
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
