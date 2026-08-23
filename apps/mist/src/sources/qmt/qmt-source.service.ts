import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { PeriodMappingService, UtilsService } from '@app/utils';
import {
  DataSource,
  K,
  KExtensionQmt,
  Period,
  Security,
} from '@app/shared-data';
import { DATASOURCE_HTTP_TIMEOUT_MS } from '../constants';
import {
  ISourceFetcher,
  KFetchParams,
  QmtExtension,
} from '../source-fetcher.interface';
import { saveBaseK } from '../k-save.helper';
import {
  QmtBarsResponseData,
  QmtEnvelope,
  QmtFieldColumn,
  QmtResponse,
  QmtSymbolMarketData,
} from './types';

const MARKET_TIME_ZONE = 'Asia/Shanghai';
const QMT_CANONICAL_DIVIDEND_TYPE = 'front_ratio';

const QMT_DEFAULT_FIELDS = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'amount',
  'time',
  'stime',
  'preClose',
  'openInterest',
  'suspendFlag',
  'settle',
  'settlementPrice',
  'settelementPrice',
];

// TypeORM .orUpdate() expects DATABASE column names, not entity property names.
const QMT_EXTENSION_UPSERT_COLUMNS = [
  'pre_close',
  'suspend_flag',
  'open_interest',
  'settle',
];

@Injectable()
export class QmtSource implements ISourceFetcher<QmtResponse> {
  private readonly axios: AxiosInstance;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.baseUrl =
      this.configService.get<string>('QMT_BASE_URL') || 'http://127.0.0.1:9002';
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: this.baseUrl,
      timeout: DATASOURCE_HTTP_TIMEOUT_MS,
    });
  }

  async fetchK(params: KFetchParams): Promise<QmtResponse[]> {
    const { formatCode, period, startDate, endDate } = params;
    const nativePeriod = this.periodMappingService.toSourceFormat(
      period,
      DataSource.QMT,
    );

    try {
      const response = await this.axios.post<QmtEnvelope<QmtBarsResponseData>>(
        '/v1/bars/query',
        {
          fields: QMT_DEFAULT_FIELDS,
          stock_list: [formatCode],
          period: nativePeriod,
          start_time: this.formatRequestTime(startDate, period),
          end_time: this.formatRequestTime(endDate, period),
          count: -1,
          dividend_type: QMT_CANONICAL_DIVIDEND_TYPE,
          fill_data: true,
          include_raw: false,
        },
      );
      const envelope = response.data;

      if (!envelope?.ok) {
        this.throwEnvelopeError(envelope, 'QMT bars query failed');
      }
      if (!envelope.data?.marketData) {
        throw new HttpException(
          'Invalid normalized QMT bars response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const symbolData = envelope.data.marketData[formatCode];
      if (!symbolData) {
        return [];
      }

      return this.mapSymbolMarketData(formatCode, symbolData, period);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch QMT data: ${errorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
        { cause: error },
      );
    }
  }

  async saveK(
    data: QmtResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      const savedKByTimestamp = await saveBaseK(
        manager,
        data,
        security,
        DataSource.QMT,
        period,
      );

      const extensions = data
        .map((d) => {
          const k = savedKByTimestamp.get(d.timestamp.getTime());
          if (!k) return null;

          return manager.create(KExtensionQmt, {
            ...this.buildExtensionPayload(k, d.extensions),
            kId: k.id,
          });
        })
        .filter((extension): extension is KExtensionQmt => extension != null);

      if (extensions.length === 0) {
        return;
      }

      const extensionValues = extensions.map((extension) => ({
        kId: extension.kId,
        preClose: extension.preClose,
        openInterest: extension.openInterest,
        suspendFlag: extension.suspendFlag,
        settle: extension.settle,
      }));

      await manager
        .createQueryBuilder()
        .insert()
        .into(KExtensionQmt)
        .values(extensionValues)
        .orUpdate(QMT_EXTENSION_UPSERT_COLUMNS, ['k_id'])
        .updateEntity(false)
        .execute();
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.QMT);
  }

  private formatRequestTime(date: Date, period: Period): string {
    const pattern = period < Period.DAY ? 'yyyyMMddHHmmss' : 'yyyyMMdd';
    return formatInTimeZone(date, MARKET_TIME_ZONE, pattern);
  }

  private mapSymbolMarketData(
    providerSymbol: string,
    symbolData: QmtSymbolMarketData,
    period: Period,
  ): QmtResponse[] {
    return this.getRowKeys(symbolData)
      .map((rowKey) => this.mapRow(providerSymbol, symbolData, rowKey, period))
      .sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
  }

  private mapRow(
    providerSymbol: string,
    symbolData: QmtSymbolMarketData,
    rowKey: string,
    period: Period,
  ): QmtResponse {
    const open = this.readNumber(symbolData, ['open'], rowKey);
    const high = this.readNumber(symbolData, ['high'], rowKey);
    const low = this.readNumber(symbolData, ['low'], rowKey);
    const close = this.readNumber(symbolData, ['close'], rowKey);
    const volume = normalizeQmtVolume(
      this.readDecimal(symbolData, ['volume'], rowKey, 'volume'),
    );

    if (open == null || high == null || low == null || close == null) {
      const invalidFields = [
        ...(open == null ? ['open'] : []),
        ...(high == null ? ['high'] : []),
        ...(low == null ? ['low'] : []),
        ...(close == null ? ['close'] : []),
      ];
      throw new HttpException(
        `QMT_INVALID_REQUIRED_OHLC: symbol=${providerSymbol} rowKey=${rowKey} invalidFields=${invalidFields.join(',')}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const rawTimestamp =
      this.readValue(symbolData, ['stime', 'time'], rowKey) ?? rowKey;
    const timestamp = this.parseQmtTimestamp(rawTimestamp);
    const amount = this.readDecimal(symbolData, ['amount'], rowKey, 'amount');
    const extensions = this.buildMappedExtension(symbolData, rowKey);

    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      amount,
      period,
      extensions,
    };
  }

  private buildMappedExtension(
    symbolData: QmtSymbolMarketData,
    rowKey: string,
  ): QmtExtension {
    const extension: QmtExtension = {};
    this.assignNumber(extension, 'preClose', symbolData, ['preClose'], rowKey);
    this.assignNumber(
      extension,
      'openInterest',
      symbolData,
      ['openInterest'],
      rowKey,
    );
    this.assignNumber(
      extension,
      'suspendFlag',
      symbolData,
      ['suspendFlag'],
      rowKey,
    );
    this.assignNumber(
      extension,
      'settle',
      symbolData,
      ['settle', 'settlementPrice', 'settelementPrice'],
      rowKey,
    );
    return extension;
  }

  private assignNumber(
    extension: QmtExtension,
    field: keyof Pick<
      QmtExtension,
      'preClose' | 'openInterest' | 'suspendFlag' | 'settle'
    >,
    symbolData: QmtSymbolMarketData,
    aliases: string[],
    rowKey: string,
  ): void {
    const value = this.readNumber(symbolData, aliases, rowKey);
    if (value != null) {
      extension[field] = value;
    }
  }

  private getRowKeys(symbolData: QmtSymbolMarketData): string[] {
    const keys = new Set<string>();
    for (const field of [
      'open',
      'high',
      'low',
      'close',
      'volume',
      'amount',
      'time',
      'stime',
    ]) {
      const column = symbolData[field];
      if (Array.isArray(column)) {
        column.forEach((_, index) => keys.add(String(index)));
      } else if (this.isRecord(column)) {
        Object.keys(column).forEach((key) => keys.add(key));
      }
    }
    return Array.from(keys);
  }

  private readNumber(
    symbolData: QmtSymbolMarketData,
    aliases: string[],
    rowKey: string,
  ): number | null {
    const value = this.readValue(symbolData, aliases, rowKey);
    if (value == null || value === '') {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private readDecimal(
    symbolData: QmtSymbolMarketData,
    aliases: string[],
    rowKey: string,
    fieldName: 'volume' | 'amount',
  ): string | null {
    const value = this.readValue(symbolData, aliases, rowKey);
    if (value == null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new TypeError(
        `QMT historical ${fieldName} must be a decimal string`,
      );
    }
    return normalizeExternalDecimalText(value);
  }

  private readValue(
    symbolData: QmtSymbolMarketData,
    aliases: string[],
    rowKey: string,
  ): unknown {
    for (const alias of aliases) {
      const column = symbolData[alias];
      const value = this.readColumnValue(column, rowKey);
      if (value != null) {
        return value;
      }
    }
    return undefined;
  }

  private readColumnValue(column: QmtFieldColumn, rowKey: string): unknown {
    if (Array.isArray(column)) {
      return column[Number(rowKey)];
    }
    if (this.isRecord(column)) {
      return column[rowKey];
    }
    return undefined;
  }

  private parseQmtTimestamp(value: unknown): Date {
    const text = String(value ?? '').trim();
    if (/^\d{8}$/.test(text)) {
      return parseISO(
        `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00+08:00`,
      );
    }
    if (/^\d{14}$/.test(text)) {
      return parseISO(
        `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}+08:00`,
      );
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)) {
      return parseISO(text.replace(' ', 'T') + '+08:00');
    }
    if (/^\d{13}$/.test(text)) {
      return new Date(Number(text));
    }
    return parseISO(text);
  }

  private buildExtensionPayload(
    k: K,
    ext: QmtExtension | undefined,
  ): Partial<KExtensionQmt> {
    return {
      k,
      preClose: ext?.preClose ?? null,
      suspendFlag: ext?.suspendFlag ?? null,
      openInterest: ext?.openInterest ?? null,
      settle: ext?.settle ?? null,
    };
  }

  private throwEnvelopeError(
    envelope: QmtEnvelope<unknown> | undefined,
    fallbackMessage: string,
  ): never {
    const code = envelope?.error?.code || 'QMT_HTTP_ERROR';
    const message = envelope?.error?.message || fallbackMessage;
    throw new HttpException(`${code}: ${message}`, HttpStatus.BAD_GATEWAY);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * QMT historical volume write-layer conversion: provider-native lots → shares.
 * A non-integral lot count is a provider contract violation and fails closed
 * (exact fixed-point ×100 via Decimal8, no binary-float arithmetic). The
 * canonical `k` table therefore stores shares for both TDX and QMT, and the
 * read-side mapper performs no source-specific scaling.
 */
function normalizeQmtVolume(value: string | null): string | null {
  if (value === null) return null;
  if (value.includes('.')) {
    throw new HttpException(
      'QMT_INVALID_FRACTIONAL_VOLUME: provider volume must be an integral lot count',
      HttpStatus.BAD_GATEWAY,
    );
  }
  return Decimal8.parseCanonical(value).scaleByUnit(100).formatCanonical();
}
