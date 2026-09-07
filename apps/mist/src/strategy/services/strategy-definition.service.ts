import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyDefinition,
  Period,
  StrategyKind,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import type { CompiledStrategyExecutionPlan } from '@app/strategy';
import { compileChanBspConfig, ChanBspConfigError } from '@app/signal';
import { Repository } from 'typeorm';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { StrategyExecutionPlanService } from '../rules/strategy-execution-plan.service';
import { SignalRegistryRpcClient } from '../runtime/signal-registry-rpc.client';

@Injectable()
export class StrategyDefinitionService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    private readonly executionPlanService: StrategyExecutionPlanService,
    private readonly signalRegistry: SignalRegistryRpcClient,
  ) {}

  async create(dto: CreateStrategyDefinitionDto): Promise<StrategyDefinition> {
    const kind = dto.kind ?? StrategyKind.RULE_DSL;
    const validation = this.validateRuleForCreate(
      kind,
      dto.rule,
      dto.signalKind,
      dto.periods,
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
            kind,
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
            rule: validation.normalizedRule,
            signalKind: dto.signalKind,
            validationSummary: validation.validationSummary,
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
    const definition = await this.definitionRepository.manager.transaction(
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
        this.validateStoredVersion(definition, version, true);
        definition.status = StrategyStatus.ENABLED;
        return await definitionRepository.save(definition);
      },
    );
    await this.signalRegistry.refresh(definition.id);
    return definition;
  }

  async disable(id: number): Promise<StrategyDefinition> {
    const definition = await this.definitionRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(StrategyDefinition);
        const current = await this.findByIdWithRepository(repository, id);
        current.status = StrategyStatus.DISABLED;
        return await repository.save(current);
      },
    );
    await this.signalRegistry.refresh(definition.id);
    return definition;
  }

  async listVersions(strategyDefinitionId: number): Promise<StrategyVersion[]> {
    const definition = await this.findById(strategyDefinitionId);
    const versions = await this.versionRepository.find({
      where: { strategyDefinitionId },
      order: { versionNumber: 'DESC' },
    });
    for (const version of versions) {
      this.validateStoredVersion(definition, version, false);
    }
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
  ): Promise<void> {
    const version = await this.requireOwnedCurrentVersion(
      definition,
      repository,
    );
    this.validateStoredVersion(definition, version, false);
  }

  /**
   * Kind-dispatched rule validation for persisted versions. `rule_dsl` keeps
   * the existing DSL compilation (realtime registration additionally applies
   * the quantity HIL gate); `chan_bsp` validates through the shared config
   * compiler.
   */
  private validateStoredVersion(
    definition: StrategyDefinition,
    version: StrategyVersion,
    forRealtime: boolean,
  ): void {
    if (definition.kind === StrategyKind.CHAN_BSP) {
      compileChanBspConfigSafe(version.rule, definition.periods);
      return;
    }
    if (definition.kind === StrategyKind.DECISION_FLOW) {
      const rootNode = (version.rule as any)?.rootNode;
      if (!rootNode || !rootNode.type) {
        throw new BadRequestException('决策流版本规则缺少有效的 rootNode');
      }
      return;
    }
    if (forRealtime) {
      this.executionPlanService.compileForRealtimeRegistration(version);
      return;
    }
    this.executionPlanService.compileStoredVersion(version);
  }

  /** Kind-dispatched rule validation for create: returns the persisted rule
   *  (normalized for DSL) and the validation summary. */
  private validateRuleForCreate(
    kind: StrategyKind,
    rule: Record<string, unknown>,
    signalKind: StrategySignalKind,
    periods: readonly Period[],
  ): {
    normalizedRule: Record<string, unknown>;
    validationSummary: Record<string, unknown>;
  } {
    if (kind === StrategyKind.CHAN_BSP) {
      const plan = compileChanBspConfigSafe(rule, periods);
      return {
        normalizedRule: rule,
        validationSummary: {
          ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
          units: plan.units,
          points: plan.points,
          direction: plan.direction,
          requiredBarCount: plan.requiredBarCount,
        },
      };
    }
    if (kind === StrategyKind.DECISION_FLOW) {
      const rootNode = (rule as any)?.rootNode;
      if (!rootNode || !rootNode.type) {
        throw new BadRequestException(
          '决策流策略必须包含有效的根节点定义 rootNode',
        );
      }
      return {
        normalizedRule: rule,
        validationSummary: {
          ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
          kind: 'decision_flow',
          rootNodeType: rootNode.type,
          requiredBarCount: (rule as any)?.requiredBarCount ?? 50,
        },
      };
    }
    const compilation = this.executionPlanService.compileForCreate(
      rule,
      signalKind,
    );
    return {
      normalizedRule: compilation.normalizedRule as Record<string, unknown>,
      validationSummary: toValidationSummary(compilation.plan),
    };
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

function compileChanBspConfigSafe(
  rule: Record<string, unknown>,
  periods: readonly Period[],
): ReturnType<typeof compileChanBspConfig> {
  try {
    return compileChanBspConfig(rule, periods);
  } catch (error) {
    if (error instanceof ChanBspConfigError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
