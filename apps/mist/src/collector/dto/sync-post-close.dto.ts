import { IsOptional, IsEnum, Matches, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Period, DataSource } from '@app/shared-data';
import { BEIJING_DATE_REGEX } from '@app/timezone';

export class SyncPostCloseDto {
  @ApiPropertyOptional({
    description: '目标交易日，格式 YYYY-MM-DD，默认为当日北京时间',
    example: '2026-08-24',
  })
  @IsOptional()
  @Matches(BEIJING_DATE_REGEX, {
    message: 'targetDate 格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  targetDate?: string;

  @ApiPropertyOptional({
    description: '同步周期列表，默认为 [1440, 1] (日线 + 1分钟线)',
    enum: Period,
    isArray: true,
    example: [Period.DAY, Period.ONE_MIN],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Period, {
    each: true,
    message: 'periods 中的每个元素必须是有效的 Period 枚举值',
  })
  periods?: Period[];

  @ApiPropertyOptional({
    description:
      '指定同步的证券代码列表，默认为全部活跃标的 (SecurityStatus.ACTIVE)',
    type: [String],
    example: ['600519', '300059'],
  })
  @IsOptional()
  @IsArray()
  securityCodes?: string[];

  @ApiPropertyOptional({
    description: '覆盖数据源（若不传则自动按 SecuritySourceConfig 解析）',
    enum: DataSource,
    example: DataSource.QMT,
  })
  @IsOptional()
  @IsEnum(DataSource, {
    message: `数据源必须是以下值之一: ${Object.keys(DataSource)
      .filter((k) => isNaN(Number(k)))
      .join(', ')}`,
  })
  source?: DataSource;
}

export interface SecuritySyncResult {
  code: string;
  period: Period;
  source: DataSource;
  success: boolean;
  count: number;
  error?: string;
  freshnessVerified?: boolean;
}

export interface PostCloseSyncReport {
  targetDate: string; // YYYY-MM-DD
  totalSecurities: number;
  totalTasks: number;
  succeededTasks: number;
  failedTasks: number;
  totalKLinesSaved: number;
  durationMs: number;
  details: SecuritySyncResult[];
}
