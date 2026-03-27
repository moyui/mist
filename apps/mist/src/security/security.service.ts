import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Security,
  SecuritySourceConfig,
  SecurityStatus,
} from '@app/shared-data';
import { InitSecurityDto } from './dto/init-security.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
  ) {}

  formatCode(code: string): string {
    return code.trim().toUpperCase();
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
  ): Promise<Security> {
    const formattedCode = this.formatCode(addSecuritySourceDto.code);

    const security = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (!security) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }

    const sourceConfig = this.sourceConfigRepository.create({
      security: security,
      source: addSecuritySourceDto.source,
      formatCode: addSecuritySourceDto.formatCode || '',
      priority: addSecuritySourceDto.priority ?? 0,
      enabled: addSecuritySourceDto.enabled ?? true,
    });
    await this.sourceConfigRepository.save(sourceConfig);

    return security;
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

    const result = await this.securityRepository.update(
      { code: formattedCode },
      { status: SecurityStatus.SUSPENDED },
    );

    if (result.affected === 0) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }
  }

  async activateSecurity(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const result = await this.securityRepository.update(
      { code: formattedCode },
      { status: SecurityStatus.ACTIVE },
    );

    if (result.affected === 0) {
      throw new NotFoundException(
        `Security with code ${formattedCode} not found`,
      );
    }
  }
}
