import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Security,
  SecuritySourceConfig,
  SecurityStatus,
} from '@app/shared-data';
import { Repository } from 'typeorm';

export interface RealtimeAllowlistEntry {
  formatCode: string;
  securityId: number;
}

@Injectable()
export class RealtimeSecurityAllowlistService {
  private readonly logger = new Logger(RealtimeSecurityAllowlistService.name);
  private readonly entries = new Map<
    DataSource.TDX | DataSource.QMT,
    Map<string, RealtimeAllowlistEntry>
  >();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigs: Repository<SecuritySourceConfig>,
  ) {}

  async initialize(
    source: DataSource.TDX | DataSource.QMT,
    environmentName: 'TDX_REALTIME_ALLOWLIST' | 'QMT_REALTIME_ALLOWLIST',
  ): Promise<void> {
    if (this.entries.has(source)) return;
    const requested = this.parse(environmentName);
    const resolved = new Map<string, RealtimeAllowlistEntry>();
    for (const formatCode of requested) {
      const entry = await this.resolveExact(source, formatCode);
      for (const [otherSource, otherEntries] of this.entries) {
        if (
          otherSource !== source &&
          [...otherEntries.values()].some(
            (other) => other.securityId === entry.securityId,
          )
        ) {
          throw new BadRequestException(
            `realtime securityId=${entry.securityId} is configured for both ${otherSource} and ${source}`,
          );
        }
      }
      resolved.set(formatCode, entry);
      this.logger.log(
        `${source} allowlist resolved: ${formatCode} -> securityId=${entry.securityId}`,
      );
    }
    this.entries.set(source, resolved);
    if (requested.length === 0) {
      this.logger.warn(
        `${environmentName} is empty; realtime subscriptions remain empty`,
      );
    }
  }

  isAuthorized(
    source: DataSource.TDX | DataSource.QMT,
    formatCode: string,
  ): boolean {
    return this.entries.get(source)?.has(formatCode) ?? false;
  }

  list(
    source: DataSource.TDX | DataSource.QMT,
  ): readonly RealtimeAllowlistEntry[] {
    return [...(this.entries.get(source)?.values() ?? [])];
  }

  resolve(
    source: DataSource.TDX | DataSource.QMT,
    formatCode: string,
  ): RealtimeAllowlistEntry | null {
    return this.entries.get(source)?.get(formatCode) ?? null;
  }

  private parse(environmentName: string): string[] {
    const requested = (this.config.get<string>(environmentName) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (new Set(requested).size !== requested.length) {
      throw new BadRequestException(
        `${environmentName} contains duplicate formatCodes`,
      );
    }
    if (requested.length > 5) {
      throw new BadRequestException(
        `${environmentName} has ${requested.length} entries; maximum is 5`,
      );
    }
    return requested;
  }

  private async resolveExact(
    source: DataSource.TDX | DataSource.QMT,
    formatCode: string,
  ): Promise<RealtimeAllowlistEntry> {
    const rows = await this.sourceConfigs
      .createQueryBuilder('cfg')
      .innerJoin(Security, 'sec', 'sec.id = cfg.security_id')
      .where('cfg.source = :source', { source })
      .andWhere('cfg.enabled = :enabled', { enabled: true })
      .andWhere('sec.status = :status', { status: SecurityStatus.ACTIVE })
      .andWhere('BINARY cfg.format_code = :formatCode', { formatCode })
      .select([
        'cfg.security_id AS securityId',
        'cfg.format_code AS formatCode',
      ])
      .getRawMany<RealtimeAllowlistEntry>();

    if (rows.length !== 1) {
      throw new BadRequestException(
        `${source} allowlist entry '${formatCode}' matched ${rows.length} records (expected exactly 1); realtime runtime fails closed`,
      );
    }
    return rows[0];
  }
}
