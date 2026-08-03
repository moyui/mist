import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategySignalSource } from '../enums/strategy-signal-source.enum';
import { StrategySignalKind } from '../enums/strategy-signal-kind.enum';
import { Security } from './security.entity';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategyVersion } from './strategy-version.entity';

@Entity({ name: 'strategy_signals' })
@Index('idx_strategy_signals_security_time', ['securityId', 'signalTime'])
export class StrategySignal {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @ManyToOne(() => StrategyDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_definition_id' })
  strategyDefinition!: StrategyDefinition;

  @Column({ name: 'strategy_version_id', type: 'int' })
  strategyVersionId: number = 0;

  @ManyToOne(() => StrategyVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_version_id' })
  strategyVersion!: StrategyVersion;

  @Column({ name: 'security_id', type: 'int' })
  securityId: number = 0;

  @ManyToOne(() => Security, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'security_id',
    foreignKeyConstraintName: 'fk_strategy_signals_security',
  })
  security!: Security;

  @Column({ type: 'int' })
  period: Period = Period.DAY;

  @Column({ type: 'enum', enum: DataSource })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({ name: 'signal_time', type: 'datetime' })
  signalTime: Date = new Date();

  @Column({
    name: 'signal_source',
    type: 'enum',
    enum: StrategySignalSource,
  })
  signalSource: StrategySignalSource = StrategySignalSource.LIVE;

  @Column({
    name: 'signal_kind',
    type: 'enum',
    enum: StrategySignalKind,
  })
  signalKind!: StrategySignalKind;

  @Column({ name: 'context_snapshot', type: 'json' })
  contextSnapshot!: Record<string, unknown>;

  @Column({ name: 'rule_snapshot', type: 'json' })
  ruleSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
