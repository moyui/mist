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
    name: 'forward_factor',
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number | null = null;

  @Column({
    name: 'vol_in_stock',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '流通股本：TDX VolInStock 字段',
  })
  volInStock: number | null = null;

  @Column({
    name: 'backward_factor',
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '后复权因子：用于处理复权数据',
  })
  backwardFactor: number | null = null;

  @Column({
    name: 'volume_ratio',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '成交量比',
  })
  volumeRatio: number | null = null;

  @Column({
    name: 'turnover_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number | null = null;

  @Column({
    name: 'turnover_amount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '换手金额',
  })
  turnoverAmount: number | null = null;

  @Column({
    name: 'total_market_value',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  totalMarketValue: number | null = null;

  @Column({
    name: 'float_market_value',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  floatMarketValue: number | null = null;

  @Column({
    name: 'earnings_per_share',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每股收益',
  })
  earningsPerShare: number | null = null;

  @Column({
    name: 'price_earnings_ratio',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '市盈率',
  })
  priceEarningsRatio: number | null = null;

  @Column({
    name: 'price_to_book_ratio',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: '市净率',
  })
  priceToBookRatio: number | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
