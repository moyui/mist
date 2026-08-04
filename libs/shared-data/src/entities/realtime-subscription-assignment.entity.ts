import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Security } from './security.entity';
import { SecuritySourceConfig } from './security-source-config.entity';

@Entity({ name: 'realtime_subscription_assignments' })
@Index('uq_realtime_subscription_assignments_security', ['securityId'], {
  unique: true,
})
@Index(
  'uq_realtime_subscription_assignments_source_config',
  ['sourceConfigId'],
  { unique: true },
)
@Index('idx_realtime_subscription_assignments_source_security', [
  'sourceConfigId',
  'securityId',
])
export class RealtimeSubscriptionAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'security_id', type: 'int' })
  securityId: number = 0;

  @ManyToOne(() => Security, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'security_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_realtime_subscription_assignments_security',
  })
  security!: Security;

  @Column({ name: 'source_config_id', type: 'int' })
  sourceConfigId: number = 0;

  @ManyToOne(() => SecuritySourceConfig, {
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn([
    {
      name: 'source_config_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName:
        'fk_realtime_subscription_assignments_source_config',
    },
    {
      name: 'security_id',
      referencedColumnName: 'securityId',
      foreignKeyConstraintName:
        'fk_realtime_subscription_assignments_source_config',
    },
  ])
  sourceConfig!: SecuritySourceConfig;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
