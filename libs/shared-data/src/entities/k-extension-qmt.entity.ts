import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { K } from './k.entity';

/**
 * Market data extension entity for QMT data source.
 * Contains additional fields specific to QMT native market data.
 */
@Entity({
  name: 'k_extensions_qmt',
})
export class KExtensionQmt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({ name: 'k_id', select: false })
  kId!: number;

  @Column({
    name: 'pre_close',
    type: 'decimal',
    precision: 20,
    scale: 6,
    nullable: true,
    comment: '昨收价',
  })
  preClose: number | null = null;

  @Column({
    name: 'suspend_flag',
    type: 'int',
    nullable: true,
    comment: '停牌标记',
  })
  suspendFlag: number | null = null;

  @Column({
    name: 'open_interest',
    type: 'decimal',
    precision: 20,
    scale: 4,
    nullable: true,
    comment: '持仓量',
  })
  openInterest: number | null = null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 6,
    nullable: true,
    comment: '结算价',
  })
  settle: number | null = null;

  @Column({
    name: 'native_period',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: 'QMT 原生周期',
  })
  nativePeriod: string | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
