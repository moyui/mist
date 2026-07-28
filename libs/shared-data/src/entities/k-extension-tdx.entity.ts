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
 * Market data extension entity for TongDaXin (通达信) data source
 * Contains additional fields specific to TDX data format using independent primary key + foreign key design
 */
@Entity({
  name: 'k_extensions_tdx',
})
export class KExtensionTdx {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({ name: 'k_id', select: false })
  kId!: number;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number | null = null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '流通股本：TDX VolInStock 字段',
  })
  volInStock: number | null = null;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '后复权因子：用于处理复权数据',
  })
  backwardFactor: number | null = null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '成交量比',
  })
  volumeRatio: number | null = null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number | null = null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '换手金额',
  })
  turnoverAmount: number | null = null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  totalMarketValue: number | null = null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  floatMarketValue: number | null = null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每股收益',
  })
  earningsPerShare: number | null = null;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '市盈率',
  })
  priceEarningsRatio: number | null = null;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: '市净率',
  })
  priceToBookRatio: number | null = null;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
