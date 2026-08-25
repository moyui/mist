import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  RealtimeSubscriptionAssignment,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { isMockMode } from '@app/config';
import { Repository } from 'typeorm';

export interface RealtimeAllowlistEntry {
  formatCode: string;
  securityId: number;
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
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignments: Repository<RealtimeSubscriptionAssignment>,
  ) {}

  async initialize(
    source: DataSource.TDX | DataSource.QMT,
    environmentName: 'TDX_REALTIME_ALLOWLIST' | 'QMT_REALTIME_ALLOWLIST',
  ): Promise<void> {
    if (this.assignedEntries.has(source)) return;
    if (isMockMode()) {
      // Mock mode has no coordinator module and no database; the env allowlist
      // remains the mock-only subscription source (env is NOT a production
      // authority anymore — declarative-realtime-configuration). Resolves
      // from memory with a stable placeholder securityId (never a DB lookup).
      const resolved = new Map<string, RealtimeAllowlistEntry>();
      for (const formatCode of this.parse(environmentName)) {
        resolved.set(formatCode, { formatCode, securityId: 1 });
      }
      this.assignedEntries.set(source, resolved);
      this.effectiveEntries.set(source, new Map(resolved));
      return;
    }
    await this.refreshAssignedFromDb(source);
  }

  /**
   * Declarative authority: assignments (DB) -> assignedEntries. Called by the
   * coordinator's scheduled reconciliation round so external DB writes are
   * picked up within one interval without a restart. Effective entries are
   * left untouched here; the convergence path (replaceEffective) updates them.
   */
  async refreshAssignedFromDb(
    source: DataSource.TDX | DataSource.QMT,
  ): Promise<void> {
    const rows = await this.assignments
      .createQueryBuilder('assignment')
      .select('source_config.format_code', 'formatCode')
      .addSelect('security.id', 'securityId')
      .innerJoin('assignment.security', 'security')
      .innerJoin('assignment.sourceConfig', 'source_config')
      .where('security.type IN (:...types)', {
        types: [SecurityType.STOCK, SecurityType.INDEX],
      })
      .andWhere('source_config.source = :source', { source })
      .andWhere('source_config.enabled = :enabled', { enabled: true })
      .andWhere('security.status = :status', { status: SecurityStatus.ACTIVE })
      .orderBy('source_config.format_code', 'ASC')
      .getRawMany<RealtimeAllowlistEntry>();
    this.assignedEntries.set(source, exactEntryMap(rows));
    this.logger.log(
      `${source} allowlist refreshed from DB: ${rows.length} entries`,
    );
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

  /** Assigned (DB-declared) entry count per source (observability accessor). */
  assignedCountFor(source: DataSource.TDX | DataSource.QMT): number {
    return this.assignedEntries.get(source)?.size ?? 0;
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

  /** Mock-only env parsing (env is not a production authority). */
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
