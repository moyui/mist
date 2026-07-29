import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import { Repository } from 'typeorm';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { UpdateStrategyDefinitionDto } from '../dto/update-strategy-definition.dto';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';

@Injectable()
export class StrategyDefinitionService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    private readonly ruleValidator: StrategyRuleValidator,
  ) {}

  async create(dto: CreateStrategyDefinitionDto): Promise<StrategyDefinition> {
    const validationSummary = this.ruleValidator.validate(dto.rule);
    return await this.definitionRepository.manager.transaction(
      async (manager) => {
        const definitionRepository = manager.getRepository(StrategyDefinition);
        const versionRepository = manager.getRepository(StrategyVersion);
        const definition = await definitionRepository.save(
          definitionRepository.create({
            name: dto.name,
            description: dto.description ?? null,
            status: StrategyStatus.DRAFT,
            targetUniverse: dto.targetUniverse,
            periods: dto.periods,
            sources: dto.sources,
          }),
        );

        const version = await versionRepository.save(
          versionRepository.create({
            strategyDefinition: definition,
            strategyDefinitionId: definition.id,
            versionNumber: 1,
            ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
            rule: dto.rule,
            validationSummary,
          }),
        );

        definition.currentVersionId = version.id;
        return await definitionRepository.save(definition);
      },
    );
  }

  async update(
    id: number,
    dto: UpdateStrategyDefinitionDto,
  ): Promise<StrategyDefinition> {
    const validationSummary =
      dto.rule === undefined
        ? undefined
        : this.ruleValidator.validate(dto.rule);

    return await this.definitionRepository.manager.transaction(
      async (manager) => {
        const definitionRepository = manager.getRepository(StrategyDefinition);
        const versionRepository = manager.getRepository(StrategyVersion);
        const definition = await this.findByIdWithRepository(
          definitionRepository,
          id,
        );

        if (dto.name !== undefined) definition.name = dto.name;
        if (dto.description !== undefined) {
          definition.description = dto.description;
        }
        if (dto.targetUniverse !== undefined) {
          definition.targetUniverse = dto.targetUniverse;
        }
        if (dto.periods !== undefined) definition.periods = dto.periods;
        if (dto.sources !== undefined) definition.sources = dto.sources;

        if (dto.rule !== undefined && validationSummary !== undefined) {
          const existingVersionCount = await versionRepository.count({
            where: { strategyDefinitionId: definition.id },
          });
          const version = await versionRepository.save(
            versionRepository.create({
              strategyDefinition: definition,
              strategyDefinitionId: definition.id,
              versionNumber: existingVersionCount + 1,
              ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
              rule: dto.rule,
              validationSummary,
            }),
          );
          definition.currentVersionId = version.id;
        }

        return await definitionRepository.save(definition);
      },
    );
  }

  async findAll(): Promise<StrategyDefinition[]> {
    return await this.definitionRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findById(id: number): Promise<StrategyDefinition> {
    return await this.findByIdWithRepository(this.definitionRepository, id);
  }

  async enable(id: number): Promise<StrategyDefinition> {
    return await this.definitionRepository.manager.transaction(
      async (manager) => {
        const definitionRepository = manager.getRepository(StrategyDefinition);
        const versionRepository = manager.getRepository(StrategyVersion);
        const definition = await this.findByIdWithRepository(
          definitionRepository,
          id,
        );
        await this.requireOwnedCurrentVersion(definition, versionRepository);
        definition.status = StrategyStatus.ENABLED;
        return await definitionRepository.save(definition);
      },
    );
  }

  async disable(id: number): Promise<StrategyDefinition> {
    const definition = await this.findById(id);
    definition.status = StrategyStatus.DISABLED;
    return await this.definitionRepository.save(definition);
  }

  async listVersions(strategyDefinitionId: number): Promise<StrategyVersion[]> {
    await this.findById(strategyDefinitionId);
    return await this.versionRepository.find({
      where: { strategyDefinitionId },
      order: { versionNumber: 'DESC' },
    });
  }

  private async findByIdWithRepository(
    repository: Repository<StrategyDefinition>,
    id: number,
  ): Promise<StrategyDefinition> {
    const definition = await repository.findOne({ where: { id } });
    if (!definition) {
      throw new NotFoundException(`Strategy definition ${id} not found`);
    }
    return definition;
  }

  private async requireOwnedCurrentVersion(
    definition: StrategyDefinition,
    repository: Repository<StrategyVersion>,
  ): Promise<StrategyVersion> {
    if (definition.currentVersionId == null) {
      throw new ConflictException(
        `Strategy definition ${definition.id} has no current version`,
      );
    }
    const version = await repository.findOne({
      where: {
        id: definition.currentVersionId,
        strategyDefinitionId: definition.id,
      },
    });
    if (!version) {
      throw new ConflictException(
        `Strategy definition ${definition.id} current version ${definition.currentVersionId} is missing or belongs to another definition`,
      );
    }
    return version;
  }
}
