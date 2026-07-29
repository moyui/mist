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
import { StrategyAlertStatus } from '../enums/strategy-alert-status.enum';
import { StrategySignal } from './strategy-signal.entity';

@Entity({ name: 'strategy_alert_events' })
@Index('uq_strategy_alert_events_dedupe_key', ['dedupeKey'], { unique: true })
export class StrategyAlertEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_signal_id', type: 'int' })
  strategySignalId: number = 0;

  @ManyToOne(() => StrategySignal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_signal_id' })
  strategySignal!: StrategySignal;

  @Column({
    type: 'enum',
    enum: StrategyAlertStatus,
    default: StrategyAlertStatus.PENDING,
  })
  status: StrategyAlertStatus = StrategyAlertStatus.PENDING;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 255 })
  dedupeKey: string = '';

  @Column({ name: 'cooldown_until', type: 'datetime', nullable: true })
  cooldownUntil?: Date | null;

  @Column({ name: 'delivery_result', type: 'json', nullable: true })
  deliveryResult?: Record<string, unknown> | null;

  @Column({ name: 'acknowledged_at', type: 'datetime', nullable: true })
  acknowledgedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updateTime!: Date;
}
