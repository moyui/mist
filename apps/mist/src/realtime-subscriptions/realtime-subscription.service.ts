import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  RealtimeSubscriptionAssignment,
  Security,
  SecuritySourceConfig,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { HttpBusinessRejection } from '@app/transport/http';
import { isValidSecuritySourceFormatCode } from '@app/utils';
import {
  DataSource as TypeOrmDataSource,
  EntityManager,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { InitializeRealtimeSubscriptionDto } from './dto/initialize-realtime-subscription.dto';
import { RealtimeSubscriptionQueryDto } from './dto/realtime-subscription-query.dto';
import { RealtimeSubscriptionLifecycleCoordinator } from './realtime-subscription-lifecycle.coordinator';
import { RealtimeSubscriptionLifecycleObservationStore } from './realtime-subscription-lifecycle-observation.store';
import { RuntimeConfigService } from './runtime-config.service';
import {
  REALTIME_ACTIVE_CAPACITY_LIMIT,
  REALTIME_ASSIGNMENT_SECURITY_UNIQUE,
  REALTIME_ASSIGNMENT_SOURCE_CONFIG_UNIQUE,
  REALTIME_SUBSCRIPTION_SOURCES,
  RealtimeSubscriptionSource,
  SECURITY_CODE_UNIQUE,
} from './realtime-subscription.constants';
import {
  RealtimeActiveCapacityDataVo,
  RealtimeAssignmentExistsDataVo,
  RealtimeSecurityExistsDataVo,
  RealtimeSecurityNotEligibleDataVo,
  RealtimeSourceConfigNotEligibleDataVo,
  RealtimeSourceConfigNotFoundDataVo,
} from './vo/realtime-subscription-error-data.vo';
import {
  RealtimeSecurityStatus,
  RealtimeSourceCapacityVo,
  RealtimeSubscriptionPageVo,
  RealtimeSubscriptionVo,
} from './vo/realtime-subscription.vo';

type InitializationRejection = HttpBusinessRejection<string, object>;
type InitializationResult =
  | RealtimeSubscriptionAssignment
  | InitializationRejection;

@Injectable()
export class RealtimeSubscriptionService {
  constructor(
    private readonly dataSource: TypeOrmDataSource,
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignmentRepository: Repository<RealtimeSubscriptionAssignment>,
    @Optional()
    private readonly lifecycleCoordinator?: RealtimeSubscriptionLifecycleCoordinator,
    @Optional()
    private readonly lifecycleObservations?: RealtimeSubscriptionLifecycleObservationStore,
    @Optional()
    private readonly runtimeConfig?: RuntimeConfigService,
  ) {}

  async initialize(
    dto: InitializeRealtimeSubscriptionDto,
  ): Promise<RealtimeSubscriptionVo | InitializationRejection> {
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        return dto.mode === 'new'
          ? await this.initializeNew(manager, dto)
          : await this.initializeExisting(manager, dto);
      });
      if (result instanceof HttpBusinessRejection) return result;
      const value = this.toVo(result);
      await this.lifecycleCoordinator?.refreshDesiredState(value.source);
      this.lifecycleCoordinator?.requestIncrementalReconciliation(value.source);
      return value;
    } catch (error) {
      return await this.mapNamedInitializationConflict(error, dto);
    }
  }

  async list(
    query: RealtimeSubscriptionQueryDto,
  ): Promise<RealtimeSubscriptionPageVo> {
    const limit = query.limit ?? 20;
    const assignments = await this.assignmentRepository.find({
      where: query.afterId ? { id: MoreThan(query.afterId) } : {},
      relations: { security: true, sourceConfig: true },
      order: { id: 'ASC' },
      take: limit + 1,
    });
    const hasMore = assignments.length > limit;
    const pageRows = hasMore ? assignments.slice(0, limit) : assignments;

    return {
      items: pageRows.map((assignment) => this.toVo(assignment)),
      nextAfterId: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
      sourceCapacities: await this.readSourceCapacities(),
    };
  }

  private async initializeNew(
    manager: EntityManager,
    dto: InitializeRealtimeSubscriptionDto,
  ): Promise<InitializationResult> {
    const source = dto.source as RealtimeSubscriptionSource;
    await this.lockSourceConfigs(manager, source);

    const existingSecurity = await manager.findOne(Security, {
      where: { code: dto.securityCode as string },
    });
    if (existingSecurity) {
      return new HttpBusinessRejection(
        'REALTIME_SECURITY_EXISTS',
        'Security already exists',
        {
          securityId: existingSecurity.id,
          securityCode: existingSecurity.code,
        } satisfies RealtimeSecurityExistsDataVo,
      );
    }

    const activeAssignmentCount = await this.countActiveAssignments(
      manager,
      source,
    );
    if (activeAssignmentCount >= REALTIME_ACTIVE_CAPACITY_LIMIT) {
      return this.capacityRejection(source, activeAssignmentCount);
    }

    const security = await manager.save(
      manager.create(Security, {
        code: dto.securityCode,
        name: dto.securityName,
        type: SecurityType.STOCK,
        status: SecurityStatus.ACTIVE,
      }),
    );
    const sourceConfig = await manager.save(
      manager.create(SecuritySourceConfig, {
        securityId: security.id,
        security,
        source,
        formatCode: dto.providerSymbol,
        priority: 0,
        enabled: true,
      }),
    );
    return await manager.save(
      manager.create(RealtimeSubscriptionAssignment, {
        securityId: security.id,
        security,
        sourceConfigId: sourceConfig.id,
        sourceConfig,
      }),
    );
  }

  private async initializeExisting(
    manager: EntityManager,
    dto: InitializeRealtimeSubscriptionDto,
  ): Promise<InitializationResult> {
    const sourceConfigId = dto.securitySourceConfigId as number;
    const initialConfig = await manager.findOne(SecuritySourceConfig, {
      where: { id: sourceConfigId },
      relations: { security: true },
    });
    if (!initialConfig) return this.sourceConfigNotFound(sourceConfigId);
    if (!this.isRealtimeSource(initialConfig.source)) {
      return this.sourceConfigNotEligible(
        sourceConfigId,
        'source_not_realtime',
      );
    }

    await this.lockSourceConfigs(manager, initialConfig.source);
    const sourceConfig = await manager.findOne(SecuritySourceConfig, {
      where: { id: sourceConfigId },
      relations: { security: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!sourceConfig) return this.sourceConfigNotFound(sourceConfigId);
    if (!this.isRealtimeSource(sourceConfig.source)) {
      return this.sourceConfigNotEligible(
        sourceConfigId,
        'source_not_realtime',
      );
    }
    if (!sourceConfig.enabled) {
      return this.sourceConfigNotEligible(sourceConfigId, 'source_disabled');
    }
    if (
      !isValidSecuritySourceFormatCode(
        sourceConfig.source,
        sourceConfig.formatCode,
      )
    ) {
      return this.sourceConfigNotEligible(
        sourceConfigId,
        'provider_symbol_invalid',
      );
    }

    const security = sourceConfig.security;
    if (!security) {
      throw new Error('Source config Security relation invariant is invalid');
    }
    if (security.type !== SecurityType.STOCK) {
      return this.securityNotEligible(security.id, 'security_not_stock');
    }
    if (security.status !== SecurityStatus.ACTIVE) {
      return this.securityNotEligible(security.id, 'security_not_active');
    }

    const existingAssignment = await manager.findOne(
      RealtimeSubscriptionAssignment,
      {
        where: [
          { securityId: security.id },
          { sourceConfigId: sourceConfig.id },
        ],
      },
    );
    if (existingAssignment) return this.assignmentExists(existingAssignment);

    const activeAssignmentCount = await this.countActiveAssignments(
      manager,
      sourceConfig.source,
    );
    if (activeAssignmentCount >= REALTIME_ACTIVE_CAPACITY_LIMIT) {
      return this.capacityRejection(sourceConfig.source, activeAssignmentCount);
    }

    return await manager.save(
      manager.create(RealtimeSubscriptionAssignment, {
        securityId: security.id,
        security,
        sourceConfigId: sourceConfig.id,
        sourceConfig,
      }),
    );
  }

  private async lockSourceConfigs(
    manager: EntityManager,
    source: RealtimeSubscriptionSource,
  ): Promise<void> {
    await manager
      .getRepository(SecuritySourceConfig)
      .createQueryBuilder('source_config')
      .setLock('pessimistic_write')
      .where('source_config.source = :source', { source })
      .orderBy('source_config.id', 'ASC')
      .getMany();
  }

  private async countActiveAssignments(
    manager: EntityManager,
    source: RealtimeSubscriptionSource,
  ): Promise<number> {
    return await manager
      .getRepository(RealtimeSubscriptionAssignment)
      .createQueryBuilder('assignment')
      .innerJoin('assignment.security', 'security')
      .innerJoin('assignment.sourceConfig', 'source_config')
      .where('security.status = :active', { active: SecurityStatus.ACTIVE })
      .andWhere('security.type = :stock', { stock: SecurityType.STOCK })
      .andWhere('source_config.source = :source', { source })
      .andWhere('source_config.enabled = :enabled', { enabled: true })
      .getCount();
  }

  private async readSourceCapacities(): Promise<RealtimeSourceCapacityVo[]> {
    const rows = await this.assignmentRepository
      .createQueryBuilder('assignment')
      .select('source_config.source', 'source')
      .addSelect('COUNT(*)', 'activeAssignmentCount')
      .innerJoin('assignment.security', 'security')
      .innerJoin('assignment.sourceConfig', 'source_config')
      .where('security.status = :active', { active: SecurityStatus.ACTIVE })
      .andWhere('security.type = :stock', { stock: SecurityType.STOCK })
      .andWhere('source_config.enabled = :enabled', { enabled: true })
      .groupBy('source_config.source')
      .getRawMany<{ source: string; activeAssignmentCount: string }>();
    const counts = new Map(
      rows.map((row) => [row.source, Number(row.activeAssignmentCount)]),
    );
    return REALTIME_SUBSCRIPTION_SOURCES.map((source) => ({
      source,
      activeAssignmentCount: counts.get(source) ?? 0,
      limit: REALTIME_ACTIVE_CAPACITY_LIMIT,
    }));
  }

  private toVo(
    assignment: RealtimeSubscriptionAssignment,
  ): RealtimeSubscriptionVo {
    const security = assignment.security;
    const sourceConfig = assignment.sourceConfig;
    if (
      !security ||
      security.type !== SecurityType.STOCK ||
      !sourceConfig ||
      !sourceConfig.enabled ||
      !this.isRealtimeSource(sourceConfig.source) ||
      !isValidSecuritySourceFormatCode(
        sourceConfig.source,
        sourceConfig.formatCode,
      )
    ) {
      throw new Error('Realtime assignment relation invariant is invalid');
    }
    const desired = security.status === SecurityStatus.ACTIVE;
    // declarative-realtime-configuration: auto_reconcile switch is cached in
    // memory by RuntimeConfigService (refreshed every scheduled round), so
    // synchronous VO projection reads the cache instead of env.
    const lifecycleEnabled =
      this.runtimeConfig?.getAutoReconcileCached() ?? false;
    const observation = this.lifecycleObservations?.project(
      sourceConfig.source,
      sourceConfig.formatCode,
      desired,
      lifecycleEnabled,
    ) ?? {
      active: null,
      activeEvidence: null,
      convergence: 'unknown' as const,
      convergenceReason: lifecycleEnabled
        ? ('transport_not_ready' as const)
        : ('lifecycle_disabled' as const),
      deferredRemovalReason: null,
    };
    return {
      assignmentId: assignment.id,
      securityId: security.id,
      securitySourceConfigId: sourceConfig.id,
      securityCode: security.code,
      securityName: security.name,
      securityType: SecurityType.STOCK,
      securityStatus: this.toPublicStatus(security.status),
      source: sourceConfig.source,
      providerSymbol: sourceConfig.formatCode,
      desired,
      ...observation,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    };
  }

  private toPublicStatus(status: SecurityStatus): RealtimeSecurityStatus {
    if (status === SecurityStatus.ACTIVE) return 'ACTIVE';
    if (status === SecurityStatus.SUSPENDED) return 'SUSPENDED';
    if (status === SecurityStatus.DELISTED) return 'DELISTED';
    throw new Error('Unknown Security status in realtime assignment');
  }

  private isRealtimeSource(
    source: DataSource,
  ): source is RealtimeSubscriptionSource {
    return REALTIME_SUBSCRIPTION_SOURCES.includes(
      source as RealtimeSubscriptionSource,
    );
  }

  private capacityRejection(
    source: RealtimeSubscriptionSource,
    activeAssignmentCount: number,
  ): InitializationRejection {
    return new HttpBusinessRejection(
      'REALTIME_ACTIVE_CAPACITY_REACHED',
      'Realtime active capacity reached',
      {
        source,
        activeAssignmentCount,
        limit: REALTIME_ACTIVE_CAPACITY_LIMIT,
      } satisfies RealtimeActiveCapacityDataVo,
    );
  }

  private assignmentExists(
    assignment: RealtimeSubscriptionAssignment,
  ): InitializationRejection {
    return new HttpBusinessRejection(
      'REALTIME_ASSIGNMENT_EXISTS',
      'Realtime assignment already exists',
      {
        assignmentId: assignment.id,
        securityId: assignment.securityId,
      } satisfies RealtimeAssignmentExistsDataVo,
    );
  }

  private sourceConfigNotFound(id: number): InitializationRejection {
    return new HttpBusinessRejection(
      'REALTIME_SOURCE_CONFIG_NOT_FOUND',
      'Source config was not found',
      {
        securitySourceConfigId: id,
      } satisfies RealtimeSourceConfigNotFoundDataVo,
    );
  }

  private sourceConfigNotEligible(
    id: number,
    reason: RealtimeSourceConfigNotEligibleDataVo['reason'],
  ): InitializationRejection {
    return new HttpBusinessRejection(
      'REALTIME_SOURCE_CONFIG_NOT_ELIGIBLE',
      'Source config is not eligible for realtime assignment',
      {
        securitySourceConfigId: id,
        reason,
      } satisfies RealtimeSourceConfigNotEligibleDataVo,
    );
  }

  private securityNotEligible(
    id: number,
    reason: RealtimeSecurityNotEligibleDataVo['reason'],
  ): InitializationRejection {
    return new HttpBusinessRejection(
      'REALTIME_SECURITY_NOT_ELIGIBLE',
      'Security is not eligible for realtime assignment',
      { securityId: id, reason } satisfies RealtimeSecurityNotEligibleDataVo,
    );
  }

  private async mapNamedInitializationConflict(
    error: unknown,
    dto: InitializeRealtimeSubscriptionDto,
  ): Promise<never | InitializationRejection> {
    const constraint = namedDuplicateConstraint(error);
    if (constraint === SECURITY_CODE_UNIQUE && dto.securityCode) {
      const security = await this.dataSource.getRepository(Security).findOne({
        where: { code: dto.securityCode },
      });
      if (security) {
        return new HttpBusinessRejection(
          'REALTIME_SECURITY_EXISTS',
          'Security already exists',
          {
            securityId: security.id,
            securityCode: security.code,
          } satisfies RealtimeSecurityExistsDataVo,
        );
      }
    }
    if (
      constraint === REALTIME_ASSIGNMENT_SECURITY_UNIQUE ||
      constraint === REALTIME_ASSIGNMENT_SOURCE_CONFIG_UNIQUE
    ) {
      const repository = this.dataSource.getRepository(
        RealtimeSubscriptionAssignment,
      );
      const assignment = await repository.findOne({
        where:
          dto.mode === 'existing'
            ? { sourceConfigId: dto.securitySourceConfigId }
            : { security: { code: dto.securityCode } },
        relations: { security: true },
      });
      if (assignment) return this.assignmentExists(assignment);
    }
    throw error;
  }
}

export function namedDuplicateConstraint(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driver = error.driverError as {
    code?: unknown;
    errno?: unknown;
    sqlMessage?: unknown;
  };
  if (driver.code !== 'ER_DUP_ENTRY' || driver.errno !== 1062) return null;
  if (typeof driver.sqlMessage !== 'string') return null;
  const match = /for key '([^']+)'\s*$/.exec(driver.sqlMessage);
  return match?.[1]?.split('.').at(-1) ?? null;
}
