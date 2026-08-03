import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { StrategyRuleSchemaVersion } from '../enums/strategy-rule-schema-version.enum';
import { StrategySignalKind } from '../enums/strategy-signal-kind.enum';
import { StrategyDefinition } from './strategy-definition.entity';

@Entity({ name: 'strategy_versions' })
@Unique(['strategyDefinitionId', 'versionNumber'])
export class StrategyVersion {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => StrategyDefinition, (definition) => definition.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategy_definition_id' })
  strategyDefinition!: StrategyDefinition;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number = 1;

  @Column({
    name: 'rule_schema_version',
    type: 'enum',
    enum: StrategyRuleSchemaVersion,
    default: StrategyRuleSchemaVersion.V1,
  })
  ruleSchemaVersion: StrategyRuleSchemaVersion = StrategyRuleSchemaVersion.V1;

  @Column({ type: 'json' })
  rule: Record<string, unknown> = {};

  @Column({
    name: 'signal_kind',
    type: 'enum',
    enum: StrategySignalKind,
  })
  signalKind!: StrategySignalKind;

  @Column({ name: 'validation_summary', type: 'json' })
  validationSummary: Record<string, unknown> = {};

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
