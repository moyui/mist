import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Security,
  SecuritySourceConfig,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { Repository } from 'typeorm';

export interface RealtimeAllowlistEntry {
  formatCode: string;
  securityId: number;
}

interface ResolvedRealtimeAllowlistRow extends RealtimeAllowlistEntry {
  securityType: SecurityType;
}

@Injectable()
export class RealtimeSecurityAllowlistService {
  private readonly logger = new Logger(RealtimeSecurityAllowlistService.name);
  private readonly assignedEntries = new Map<
    DataSource.TDX | DataSource.QMT,
    Map<string, RealtimeAllowlistEntry>
  >();
  private readonly effectiveEntries = new Map<
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
    if (this.assignedEntries.has(source)) return;
    if (
      this.config.get<string>('REALTIME_SUBSCRIPTION_LIFECYCLE_MODE') === 'on'
    ) {
      this.assignedEntries.set(source, new Map());
      this.effectiveEntries.set(source, new Map());
      return;
    }
    const requested = this.parse(environmentName);
    const resolved = new Map<string, RealtimeAllowlistEntry>();
    for (const formatCode of requested) {
      const entry = await this.resolveExact(source, formatCode);
      for (const [otherSource, otherEntries] of this.assignedEntries) {
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
    this.assignedEntries.set(source, resolved);
    this.effectiveEntries.set(source, new Map(resolved));
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
    return this.assignedEntries.get(source)?.has(formatCode) ?? false;
  }

  list(
    source: DataSource.TDX | DataSource.QMT,
  ): readonly RealtimeAllowlistEntry[] {
    return [...(this.effectiveEntries.get(source)?.values() ?? [])];
  }

  resolve(
    source: DataSource.TDX | DataSource.QMT,
    formatCode: string,
  ): RealtimeAllowlistEntry | null {
    return this.assignedEntries.get(source)?.get(formatCode) ?? null;
  }

  resolveEffective(
    source: DataSource.TDX | DataSource.QMT,
    formatCode: string,
  ): RealtimeAllowlistEntry | null {
    return this.effectiveEntries.get(source)?.get(formatCode) ?? null;
  }

  replaceAssigned(
    source: DataSource.TDX | DataSource.QMT,
    entries: readonly RealtimeAllowlistEntry[],
  ): void {
    this.assignedEntries.set(source, exactEntryMap(entries));
    const active = this.effectiveEntries.get(source) ?? new Map();
    this.effectiveEntries.set(
      source,
      new Map(
        [...active].filter(
          ([formatCode, entry]) =>
            this.assignedEntries.get(source)?.get(formatCode)?.securityId ===
            entry.securityId,
        ),
      ),
    );
  }

  replaceEffective(
    source: DataSource.TDX | DataSource.QMT,
    activeSymbols: readonly string[],
  ): readonly RealtimeAllowlistEntry[] {
    const assigned = this.assignedEntries.get(source) ?? new Map();
    const next = new Map<string, RealtimeAllowlistEntry>();
    for (const formatCode of activeSymbols) {
      const entry = assigned.get(formatCode);
      if (entry) next.set(formatCode, entry);
    }
    const previous = this.effectiveEntries.get(source) ?? new Map();
    const removed = [...previous.entries()]
      .filter(([formatCode]) => !next.has(formatCode))
      .map(([, entry]) => entry);
    this.effectiveEntries.set(source, next);
    return removed;
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
        'sec.type AS securityType',
      ])
      .getRawMany<ResolvedRealtimeAllowlistRow>();

    if (rows.length !== 1) {
      throw new BadRequestException(
        `${source} allowlist entry '${formatCode}' matched ${rows.length} records (expected exactly 1); realtime runtime fails closed`,
      );
    }
    const [row] = rows;
    if (row.securityType !== SecurityType.STOCK) {
      throw new BadRequestException(
        `${source} allowlist entry '${formatCode}' resolves to unsupported security type ${row.securityType}; realtime candle quantities support STOCK only`,
      );
    }
    return { securityId: row.securityId, formatCode: row.formatCode };
  }
}

function exactEntryMap(entries: readonly RealtimeAllowlistEntry[]) {
  const result = new Map<string, RealtimeAllowlistEntry>();
  for (const entry of entries) {
    const existing = result.get(entry.formatCode);
    if (existing && existing.securityId !== entry.securityId) {
      throw new BadRequestException(
        `realtime provider symbol '${entry.formatCode}' maps to multiple securities`,
      );
    }
    result.set(entry.formatCode, entry);
  }
  return result;
}
