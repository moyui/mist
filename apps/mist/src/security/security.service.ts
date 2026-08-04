import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource as TypeOrmDataSource, Repository } from 'typeorm';
import {
  Security,
  SecuritySourceConfig,
  RealtimeSubscriptionAssignment,
  SecurityStatus,
  DataSource,
} from '@app/shared-data';
import { HttpBusinessRejection } from '@app/transport/http';
import {
  isValidSecuritySourceFormatCode,
  normalizeSecurityCode,
} from '@app/utils';
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';
import {
  REALTIME_ACTIVE_CAPACITY_LIMIT,
  REALTIME_SUBSCRIPTION_SOURCES,
  RealtimeSubscriptionSource,
} from '../realtime-subscriptions/realtime-subscription.constants';
import {
  RealtimeActiveCapacityDataVo,
  RealtimeSourceLockedDataVo,
} from '../realtime-subscriptions/vo/realtime-subscription-error-data.vo';
import { RealtimeSubscriptionLifecycleCoordinator } from '../realtime-subscriptions/realtime-subscription-lifecycle.coordinator';

@Injectable()
export class SecurityService {
  constructor(
    private readonly dataSource: TypeOrmDataSource,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignmentRepository: Repository<RealtimeSubscriptionAssignment>,
    @Optional()
    private readonly lifecycleCoordinator?: RealtimeSubscriptionLifecycleCoordinator,
  ) {}

  formatCode(code: string): string {
    return normalizeSecurityCode(code);
  }

  async initializeSecurity(
    initSecurityDto: InitSecurityDto,
  ): Promise<Security> {
    const formattedCode = this.formatCode(initSecurityDto.code);

    const existingSecurity = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (existingSecurity) {
      throw new ConflictException(
        `Security with code ${formattedCode} already exists`,
      );
    }

    // Create security
    const security = this.securityRepository.create({
      code: formattedCode,
      name: initSecurityDto.name || '',
      type: initSecurityDto.type,
      status: SecurityStatus.ACTIVE,
    });

    return await this.securityRepository.save(security);
  }

  async addSecuritySource(
    addSecuritySourceDto: AddSecuritySourceDto,
  ): Promise<Security | HttpBusinessRejection<string, object>> {
    const formattedCode = this.formatCode(addSecuritySourceDto.code);
    return await this.dataSource.transaction(async (manager) => {
      const security = await manager.findOne(Security, {
        where: { code: formattedCode },
      });
      if (!security) {
        throw new NotFoundException(
          `Security with code ${formattedCode} not found`,
        );
      }

      const existingSourceConfig = await manager.findOne(SecuritySourceConfig, {
        where: {
          securityId: security.id,
          source: addSecuritySourceDto.source,
        },
        lock: { mode: 'pessimistic_write' },
      });
      const formatCode =
        addSecuritySourceDto.formatCode?.trim() ??
        existingSourceConfig?.formatCode.trim() ??
        '';
      const enabled =
        addSecuritySourceDto.enabled ?? existingSourceConfig?.enabled ?? true;
      const priority =
        addSecuritySourceDto.priority ?? existingSourceConfig?.priority ?? 0;

      if (
        enabled &&
        !isValidSecuritySourceFormatCode(
          addSecuritySourceDto.source,
          formatCode,
        )
      ) {
        const expected =
          addSecuritySourceDto.source === DataSource.TDX ||
          addSecuritySourceDto.source === DataSource.QMT
            ? 'a six-digit provider symbol ending in .SH, .SZ, or .BJ'
            : 'a non-empty provider symbol';
        throw new BadRequestException(
          `Enabled ${addSecuritySourceDto.source} source requires formatCode to be ${expected}`,
        );
      }

      if (existingSourceConfig) {
        const assignment = await manager.findOne(
          RealtimeSubscriptionAssignment,
          { where: { sourceConfigId: existingSourceConfig.id } },
        );
        const changesLockedIdentity =
          assignment &&
          (formatCode !== existingSourceConfig.formatCode.trim() ||
            enabled !== existingSourceConfig.enabled);
        if (assignment && changesLockedIdentity) {
          return this.sourceLocked(assignment);
        }
      }

      const sourceConfig = existingSourceConfig
        ? Object.assign(existingSourceConfig, {
            formatCode,
            priority,
            enabled,
          })
        : manager.create(SecuritySourceConfig, {
            security,
            securityId: security.id,
            source: addSecuritySourceDto.source,
            formatCode,
            priority,
            enabled,
          });
      await manager.save(sourceConfig);
      return security;
    });
  }

  async findSecurityByCode(code: string): Promise<Security> {
    const formattedCode = this.formatCode(code);

    const security = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (!security) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }

    return security;
  }

  async getSecuritySources(code: string): Promise<
    Array<{
      id: number;
      securityId: number;
      source: string;
      formatCode: string;
      priority: number;
      enabled: boolean;
    }>
  > {
    const security = await this.findSecurityByCode(code);

    // Get all source configs for this security, ordered by priority (highest first)
    const sourceConfigs = await this.sourceConfigRepository.find({
      where: { security: { id: security.id } },
      relations: ['security'],
      order: { priority: 'DESC' },
    });

    // Return all source configs with all fields
    return sourceConfigs.map((config) => ({
      id: config.id,
      securityId: config.securityId,
      source: config.source,
      formatCode: config.formatCode,
      priority: config.priority,
      enabled: config.enabled,
    }));
  }

  async findAll(): Promise<Security[]> {
    return await this.securityRepository.find({
      order: { code: 'ASC' },
    });
  }

  /**
   * Get all active securities for scheduled collection.
   *
   * Returns array of security codes that have ACTIVE status.
   * Used by the scheduler to determine which securities to collect data for.
   *
   * @returns Array of active security codes
   */
  async getActiveSecurities(): Promise<string[]> {
    const securities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
      select: ['code'],
      order: { code: 'ASC' },
    });

    return securities.map((s) => s.code);
  }

  async deactivateSecurity(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const security = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });
    if (!security) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }
    const assignment = await this.assignmentRepository.findOne({
      where: { securityId: security.id },
      relations: { sourceConfig: true },
    });

    const result = await this.securityRepository.update(
      { code: formattedCode },
      { status: SecurityStatus.SUSPENDED },
    );

    if (result.affected === 0) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }
    if (assignment) {
      const source = assignment.sourceConfig.source;
      if (!this.isRealtimeSource(source)) {
        throw new Error('Assigned realtime source is invalid');
      }
      await this.lifecycleCoordinator?.refreshDesiredState(source);
    }
  }

  async activateSecurity(
    code: string,
  ): Promise<void | HttpBusinessRejection<string, object>> {
    const formattedCode = this.formatCode(code);
    const security = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });
    if (!security) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }

    const assignment = await this.assignmentRepository.findOne({
      where: { securityId: security.id },
      relations: { sourceConfig: true },
    });
    if (!assignment) {
      await this.securityRepository.update(
        { id: security.id },
        { status: SecurityStatus.ACTIVE },
      );
      return;
    }
    const source = assignment.sourceConfig.source;
    if (!this.isRealtimeSource(source)) {
      throw new Error('Assigned realtime source is invalid');
    }

    const transition = await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(SecuritySourceConfig)
        .createQueryBuilder('source_config')
        .setLock('pessimistic_write')
        .where('source_config.source = :source', { source })
        .orderBy('source_config.id', 'ASC')
        .getMany();
      const lockedSecurity = await manager.findOne(Security, {
        where: { id: security.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedSecurity) {
        throw new NotFoundException(
          `Security with code ${formattedCode} not found`,
        );
      }
      if (lockedSecurity.status === SecurityStatus.ACTIVE) return false;

      const activeAssignmentCount = await manager
        .getRepository(RealtimeSubscriptionAssignment)
        .createQueryBuilder('realtime_assignment')
        .innerJoin('realtime_assignment.security', 'active_security')
        .innerJoin('realtime_assignment.sourceConfig', 'active_source_config')
        .where('active_security.status = :active', {
          active: SecurityStatus.ACTIVE,
        })
        .andWhere('active_source_config.source = :source', { source })
        .getCount();
      if (activeAssignmentCount >= REALTIME_ACTIVE_CAPACITY_LIMIT) {
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
      await manager.update(
        Security,
        { id: lockedSecurity.id },
        { status: SecurityStatus.ACTIVE },
      );
      return true;
    });
    if (transition instanceof HttpBusinessRejection) return transition;
    if (transition) {
      await this.lifecycleCoordinator?.refreshDesiredState(source);
      this.lifecycleCoordinator?.requestIncrementalReconciliation(source);
    }
  }

  async deleteSecuritySource(
    id: number,
    securityId: number,
  ): Promise<void | HttpBusinessRejection<string, object>> {
    return await this.dataSource.transaction(async (manager) => {
      const sourceConfig = await manager.findOne(SecuritySourceConfig, {
        where: { id, securityId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sourceConfig) {
        throw new NotFoundException(
          `Source config with id ${id} and securityId ${securityId} not found`,
        );
      }
      const assignment = await manager.findOne(RealtimeSubscriptionAssignment, {
        where: { sourceConfigId: id },
      });
      if (assignment) return this.sourceLocked(assignment);
      await manager.delete(SecuritySourceConfig, { id, securityId });
    });
  }

  private sourceLocked(
    assignment: RealtimeSubscriptionAssignment,
  ): HttpBusinessRejection<string, object> {
    return new HttpBusinessRejection(
      'REALTIME_SOURCE_LOCKED',
      'Realtime source is locked by an assignment',
      {
        assignmentId: assignment.id,
        securityId: assignment.securityId,
        securitySourceConfigId: assignment.sourceConfigId,
      } satisfies RealtimeSourceLockedDataVo,
    );
  }

  private isRealtimeSource(
    source: DataSource,
  ): source is RealtimeSubscriptionSource {
    return REALTIME_SUBSCRIPTION_SOURCES.includes(
      source as RealtimeSubscriptionSource,
    );
  }
}
