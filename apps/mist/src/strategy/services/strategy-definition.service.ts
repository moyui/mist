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
import type { CompiledStrategyExecutionPlan } from '@app/strategy';
import { Repository } from 'typeorm';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { StrategyExecutionPlanService } from '../rules/strategy-execution-plan.service';

@Injectable()
export class StrategyDefinitionService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    private readonly executionPlanService: StrategyExecutionPlanService,
  ) {}

  async create(dto: CreateStrategyDefinitionDto): Promise<StrategyDefinition> {
    const compilation = this.executionPlanService.compileForCreate(
      dto.rule,
      dto.signalKind,
    );
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
            rule: compilation.normalizedRule as Record<string, unknown>,
            signalKind: dto.signalKind,
            validationSummary: toValidationSummary(compilation.plan),
          }),
        );

        definition.currentVersionId = version.id;
        return await definitionRepository.save(definition);
      },
    );
  }

  async findAll(): Promise<StrategyDefinition[]> {
    const definitions = await this.definitionRepository.find({
      order: { id: 'DESC' },
    });
    for (const definition of definitions) {
      await this.requireCompiledCurrentVersion(
        definition,
        this.versionRepository,
      );
    }
    return definitions;
  }

  async findById(id: number): Promise<StrategyDefinition> {
    const definition = await this.findByIdWithRepository(
      this.definitionRepository,
      id,
    );
    await this.requireCompiledCurrentVersion(
      definition,
      this.versionRepository,
    );
    return definition;
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
        const version = await this.requireOwnedCurrentVersion(
          definition,
          versionRepository,
        );
        this.executionPlanService.compileForRealtimeRegistration(version);
        definition.status = StrategyStatus.ENABLED;
        return await definitionRepository.save(definition);
      },
    );
  }

  async disable(id: number): Promise<StrategyDefinition> {
    const definition = await this.findByIdWithRepository(
      this.definitionRepository,
      id,
    );
    definition.status = StrategyStatus.DISABLED;
    return await this.definitionRepository.save(definition);
  }

  async listVersions(strategyDefinitionId: number): Promise<StrategyVersion[]> {
    await this.findById(strategyDefinitionId);
    const versions = await this.versionRepository.find({
      where: { strategyDefinitionId },
      order: { versionNumber: 'DESC' },
    });
    versions.forEach((version) =>
      this.executionPlanService.compileStoredVersion(version),
    );
    return versions;
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

  private async requireCompiledCurrentVersion(
    definition: StrategyDefinition,
    repository: Repository<StrategyVersion>,
  ): Promise<CompiledStrategyExecutionPlan> {
    const version = await this.requireOwnedCurrentVersion(
      definition,
      repository,
    );
    return this.executionPlanService.compileStoredVersion(version);
  }
}

function toValidationSummary(
  plan: CompiledStrategyExecutionPlan,
): Record<string, unknown> {
  return {
    ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
    signalKind: plan.signalKind,
    conditionCount: plan.conditionCount,
    fields: plan.fields,
    requiredBarCount: plan.requiredBarCount,
  };
}
