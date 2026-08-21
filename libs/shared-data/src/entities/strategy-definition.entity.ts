import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategyKind } from '../enums/strategy-kind.enum';
import { StrategyStatus } from '../enums/strategy-status.enum';
import { StrategyVersion } from './strategy-version.entity';

@Entity({ name: 'strategy_definitions' })
export class StrategyDefinition {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name: string = '';

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'enum',
    enum: StrategyStatus,
    default: StrategyStatus.DRAFT,
  })
  status: StrategyStatus = StrategyStatus.DRAFT;

  @Column({
    type: 'enum',
    enum: StrategyKind,
    default: StrategyKind.RULE_DSL,
  })
  kind: StrategyKind = StrategyKind.RULE_DSL;

  @Column({ name: 'target_universe', type: 'json' })
  targetUniverse: string[] = [];

  @Column({ type: 'json' })
  periods: Period[] = [];

  @Column({ type: 'json' })
  sources: DataSource[] = [];

  @Column({ name: 'current_version_id', type: 'int', nullable: true })
  currentVersionId?: number | null;

  @ManyToOne(() => StrategyVersion, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'id', referencedColumnName: 'strategyDefinitionId' },
    { name: 'current_version_id', referencedColumnName: 'id' },
  ])
  currentVersion?: StrategyVersion | null;

  @OneToMany(() => StrategyVersion, (version) => version.strategyDefinition)
  versions!: StrategyVersion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
