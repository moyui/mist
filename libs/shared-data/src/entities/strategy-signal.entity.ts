import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategySignalSource } from '../enums/strategy-signal-source.enum';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategyVersion } from './strategy-version.entity';

@Entity({ name: 'strategy_signals' })
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

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

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

  @Column({ name: 'context_snapshot', type: 'json' })
  contextSnapshot!: Record<string, unknown>;

  @Column({ name: 'rule_snapshot', type: 'json' })
  ruleSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;
}
