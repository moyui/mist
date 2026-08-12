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
import { NotificationChannel } from '../enums/notification-channel.enum';
import { StrategyAlertDeliveryStatus } from '../enums/strategy-alert-delivery-status.enum';
import { StrategyAlertEvent } from './strategy-alert-event.entity';

@Entity({ name: 'strategy_alert_deliveries' })
@Index(
  'uq_strategy_alert_deliveries_event_channel',
  ['strategyAlertEventId', 'channel'],
  {
    unique: true,
  },
)
export class StrategyAlertDelivery {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_alert_event_id', type: 'int' })
  strategyAlertEventId: number = 0;

  @ManyToOne(() => StrategyAlertEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_alert_event_id' })
  strategyAlertEvent!: StrategyAlertEvent;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel = NotificationChannel.WECHAT;

  @Column({
    type: 'enum',
    enum: StrategyAlertDeliveryStatus,
    default: StrategyAlertDeliveryStatus.PENDING,
  })
  status: StrategyAlertDeliveryStatus = StrategyAlertDeliveryStatus.PENDING;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number = 0;

  @Column({ name: 'last_error', type: 'varchar', length: 1024, nullable: true })
  lastError?: string | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId?: string | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
